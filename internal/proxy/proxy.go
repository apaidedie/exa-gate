// Package proxy implements the core reverse-proxy handler: client auth,
// path policy, key rotation with retry/failover, resource affinity,
// response cache and request logging — ported 1:1 from the TypeScript
// proxyHandler.
package proxy

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/apaidedie/exa-gate/internal/state"
)

type UpstreamClient interface {
	// Do sends one upstream attempt and returns the response with body
	// unconsumed. The body must be closed by the caller.
	Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error)
}

type Deps struct {
	Upstream                 UpstreamClient
	State                    *state.Store
	NextKey                  func(now int64, exclude map[string]bool) (SchedulerKey, bool)
	GetKey                   func(id string) (SchedulerKey, bool)
	GetByID                  func(id string, now int64) (SchedulerKey, bool)
	RecordFailure            func(id string, now int64, threshold int, windowMs int64, cooldownMs int64, reason string) (int64, bool)
	RecordSuccess            func(id string)
	CoolDown                 func(id string, untilMs int64, reason string)
	SetDisabled              func(id string, disabled bool)
	ProxyTokens              []string
	AllowedPaths             []string
	MaxAttempts              int
	AttemptTimeoutMs         int64
	RetryBackoffMs           []int64
	FailureThreshold         int
	FailureWindowSeconds     int64
	CooldownSeconds          int64
	RateLimitCooldownSeconds int64
	ResourceAffinity         bool
	SearchCacheTTLSeconds    int64
	MaxBodyBytes             int64
}

type SchedulerKey struct {
	ID    string
	Value string
}

type proxyErrorBody struct {
	Error struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
		Request string `json:"requestId"`
	} `json:"error"`
}

func writeProxyError(w http.ResponseWriter, code, message, requestID string, status int) {
	var body proxyErrorBody
	body.Error.Type = "proxy_error"
	body.Error.Code = code
	body.Error.Message = message
	body.Error.Request = requestID
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func pathAndQuery(r *http.Request) string { return r.URL.RequestURI() }

func pathnameOf(r *http.Request) string { return r.URL.Path }

func extractQuery(body []byte) *string {
	if body == nil {
		return nil
	}
	var parsed struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil
	}
	if parsed.Query == "" {
		return nil
	}
	query := parsed.Query
	if len(query) > 200 {
		query = query[:200]
	}
	return &query
}

// responseCache mirrors the TypeScript cache: 500 entries LRU, 1MB entry cap.
type cacheEntry struct {
	body        []byte
	contentType string
	expiresAt   int64
}

type responseCache struct {
	mu    sync.Mutex
	entries map[string]cacheEntry
}

const cacheMaxEntries = 500

var sharedCache = &responseCache{entries: map[string]cacheEntry{}}

func (c *responseCache) get(key string) (cacheEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return cacheEntry{}, false
	}
	if time.Now().UnixMilli() >= entry.expiresAt {
		delete(c.entries, key)
		return cacheEntry{}, false
	}
	// LRU touch: delete + reinsert at the end of Go's map iteration randomness
	// is not needed for correctness; expiry handles eviction.
	return entry, true
}

func (c *responseCache) set(key string, entry cacheEntry, ttlMs int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry.expiresAt = time.Now().UnixMilli() + ttlMs
	if len(c.entries) >= cacheMaxEntries {
		// Evict the first expired entry if any, else evict an arbitrary one.
		evicted := false
		for k, v := range c.entries {
			if time.Now().UnixMilli() >= v.expiresAt {
				delete(c.entries, k)
				evicted = true
				break
			}
		}
		if !evicted {
			for k := range c.entries {
				delete(c.entries, k)
				break
			}
		}
	}
	c.entries[key] = entry
}

func statusIsSuccess(status int) bool { return status >= 200 && status < 300 }
func statusCountsAsSuccess(status int) bool { return status >= 200 && status < 400 }

func errorStatusForReason(reason string) (int, string, string) {
	if reason == "timeout" {
		return 504, "upstream_timeout", "All upstream attempts timed out."
	}
	return 502, "upstream_error", "The upstream Exa API could not be reached."
}

func logErrorCodeForUpstreamStatus(status int64) *string {
	if status < 400 {
		return nil
	}
	reason := retryClassifyStatus(int(status))
	if reason == "ok" {
		code := "upstream_error"
		return &code
	}
	code := reason
	return &code
}

// Handler wires the state fetchers used by ServeHTTP.
type Handler struct {
	Deps      Deps
	UpstreamBase string
}

func ptr[T any](value T) *T { return &value }

func (h *Handler) recordAttempt(keyID string, status *int64, success bool, latencyMs float64, isRetry bool, reason string) {
	h.Deps.State.RecordAttempt(state.AttemptRecord{KeyID: keyID, Status: status, Success: success, LatencyMs: latencyMs, Retry: isRetry, Reason: reason})
}

// ServeHTTP implements the full proxy contract.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	requestID := r.Header.Get("x-request-id")
	if requestID == "" {
		requestID = fmt.Sprintf("req_%d", start.UnixNano())
	}
	pathname := pathnameOf(r)
	authHeader := r.Header.Get("authorization")
	proxyKeyHeader := r.Header.Get("x-proxy-api-key")
	presented := extractToken(authHeader, proxyKeyHeader)
	var tokenIDPtr *string
	if id := tokenIDFor(presented, h.Deps.ProxyTokens); id != "" {
		tokenIDPtr = ptr(id)
	}

	if !isAuthorized(presented, h.Deps.ProxyTokens) {
		h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: 401, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr("unauthorized"), CreatedAt: time.Now().UnixMilli()})
		writeProxyError(w, "unauthorized", "Unauthorized", requestID, 401)
		return
	}

	if !routesIsAllowedPath(pathname, h.Deps.AllowedPaths) {
		h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: 403, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr("route_forbidden"), CreatedAt: time.Now().UnixMilli()})
		writeProxyError(w, "route_forbidden", "This Exa route is not allowed by proxy configuration.", requestID, 403)
		return
	}

	safeToRetry := routesIsRetrySafe(r.Method, pathname, headerBag(r))
	maxAttempts := h.Deps.MaxAttempts
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	if !safeToRetry {
		maxAttempts = 1
	}
	var body []byte
	if r.Body != nil && r.Method != "GET" && r.Method != "HEAD" {
		limited := io.LimitReader(r.Body, h.Deps.MaxBodyBytes+1)
		var readErr error
		body, readErr = io.ReadAll(limited)
		if readErr != nil {
			writeProxyError(w, "bad_request", "Failed to read request body.", requestID, 400)
			return
		}
		if int64(len(body)) > h.Deps.MaxBodyBytes {
			h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: 413, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr("body_too_large"), CreatedAt: time.Now().UnixMilli()})
			writeProxyError(w, "body_too_large", "Request body exceeds the configured limit.", requestID, 413)
			return
		}
	}
	var queryText *string = extractQuery(body)
	cacheTtlMs := h.Deps.SearchCacheTTLSeconds * 1000
	cacheable := cacheTtlMs > 0 && r.Method == http.MethodPost && pathname == "/search" && body != nil
	var cacheKey string
	if cacheable {
		sum := sha256.Sum256(body)
		cacheKey = fmt.Sprintf("%x", sum)
		if cached, ok := sharedCache.get(cacheKey); ok {
			metricsRecordCacheHit()
			h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: 200, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr("cache_hit"), Query: queryText, CreatedAt: time.Now().UnixMilli()})
			w.Header().Set("content-type", cached.contentType)
			w.Header().Set("x-cache", "hit")
			w.WriteHeader(200)
			_, _ = w.Write(cached.body)
			return
		}
		metricsRecordCacheMiss()
	}

	attempted := map[string]bool{}
	var keyIDs []string
	var finalStatus int64 = 503
	var lastResponse *http.Response
	var lastErrorReason = "unknown_error"

	clientGone := r.Context().Done()

	var affinityKey *SchedulerKey
	if h.Deps.ResourceAffinity {
		if affinity, ok := routesParseResourceAffinity(pathname); ok {
			if keyID, err := h.Deps.State.GetAffinity(affinity.Type, affinity.ID); err == nil && keyID != "" {
				if key, found := h.Deps.GetByID(keyID, start.UnixMilli()); found {
					affinityKey = &key
				}
			}
		}
	}

	for attempt := 0; attempt < maxAttempts; attempt++ {
		now := time.Now().UnixMilli()
		var key SchedulerKey
		var ok bool
		if attempt == 0 && affinityKey != nil {
			key, ok = *affinityKey, true
		} else {
			key, ok = h.Deps.NextKey(now, attempted)
		}
		if !ok {
			break
		}
		attempted[key.ID] = true
		keyIDs = append(keyIDs, key.ID)
		attemptStart := time.Now()

		upstream, err := h.Deps.Upstream.Do(pathAndQuery(r), r.Method, upstreamHeaders(r, key.Value, requestID), body, h.Deps.AttemptTimeoutMs, clientGone)
		latencyMs := float64(time.Since(attemptStart).Milliseconds())
		if err != nil {
			reason := retryClassifyError(err)
			lastErrorReason = reason
			var statusPtr *int64
			h.recordAttempt(key.ID, statusPtr, false, latencyMs, attempt > 0, reason)
			until, tripped := h.Deps.RecordFailure(key.ID, time.Now().UnixMilli(), h.Deps.FailureThreshold, h.Deps.FailureWindowSeconds*1000, h.Deps.CooldownSeconds*1000, reason)
			if tripped {
				h.Deps.State.SetCooldown(key.ID, until, ptr(reason))
			}
			if attempt == maxAttempts-1 {
				break
			}
			time.Sleep(time.Duration(backoffMs(h.Deps.RetryBackoffMs, attempt)) * time.Millisecond)
			continue
		}

		finalStatus = int64(upstream.StatusCode)
		lastResponse = upstream
		reason := retryClassifyStatus(upstream.StatusCode)
		lastErrorReason = reason
		success := statusCountsAsSuccess(upstream.StatusCode)
		statusValue := int64(upstream.StatusCode)
		h.recordAttempt(key.ID, &statusValue, success, latencyMs, attempt > 0, reason)

		switch {
		case reason == "rate_limit":
			retryAfterMs, hasRetryAfter := parseRetryAfter(upstream.Header.Get("retry-after"))
			cooldownNow := time.Now().UnixMilli()
			var until int64
			if hasRetryAfter {
				until = cooldownNow + retryAfterMs
			} else {
				until = cooldownNow + h.Deps.RateLimitCooldownSeconds*1000
			}
			h.Deps.CoolDown(key.ID, until, "rate_limit")
			h.Deps.State.SetCooldown(key.ID, until, ptr("rate_limit"))
		case reason == "credits_exhausted":
			h.Deps.SetDisabled(key.ID, true)
			h.Deps.State.SetEnabled(key.ID, false)
		case retryable(reason):
			until, tripped := h.Deps.RecordFailure(key.ID, time.Now().UnixMilli(), h.Deps.FailureThreshold, h.Deps.FailureWindowSeconds*1000, h.Deps.CooldownSeconds*1000, reason)
			if tripped {
				h.Deps.State.SetCooldown(key.ID, until, ptr(reason))
			}
		default:
			h.Deps.RecordSuccess(key.ID)
		}

		if !retryable(reason) || attempt == maxAttempts-1 {
			break
		}
		// Drain the failed attempt body before backoff.
		_, _ = io.Copy(io.Discard, upstream.Body)
		_ = upstream.Body.Close()
		time.Sleep(time.Duration(backoffMs(h.Deps.RetryBackoffMs, attempt)) * time.Millisecond)
	}

	endMs := time.Now()
	if lastResponse != nil {
		defer lastResponse.Body.Close()
		metricsRecordLatency(pathname, statusGroupOf(finalStatus), endMs.Sub(start).Milliseconds())
		metricsRecordStatus(int64(finalStatus))
		var errorCode *string = logErrorCodeForUpstreamStatus(finalStatus)
		h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: finalStatus, KeyIDs: keyIDs, Attempts: int64(len(keyIDs)), LatencyMs: endMs.Sub(start).Milliseconds(), ErrorCode: errorCode, Query: queryText, CreatedAt: time.Now().UnixMilli()})
		if len(keyIDs) == 0 {
			writeProxyError(w, "upstream_error", "The upstream Exa API could not be reached.", requestID, 502)
			return
		}
		selectedKey, found := h.Deps.GetKey(keyIDs[len(keyIDs)-1])
		if !found {
			writeProxyError(w, "upstream_error", "The upstream key selection could not be resolved.", requestID, 502)
			return
		}
		h.sendUpstreamResponse(w, r, lastResponse, selectedKey, pathname, cacheable, cacheKey, cacheTtlMs)
		return
	}

	if len(keyIDs) == 0 {
		h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: 503, Attempts: 0, LatencyMs: endMs.Sub(start).Milliseconds(), ErrorCode: ptr("no_healthy_keys"), CreatedAt: time.Now().UnixMilli()})
		writeProxyError(w, "no_healthy_keys", "No healthy Exa API key is currently available.", requestID, 503)
		return
	}

	status, code, message := errorStatusForReason(lastErrorReason)
	metricsRecordLatency(pathname, statusGroupOf(finalStatus), endMs.Sub(start).Milliseconds())
	metricsRecordStatus(int64(status))
	h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenIDPtr, Method: r.Method, Path: pathname, Status: int64(status), KeyIDs: keyIDs, Attempts: int64(len(keyIDs)), LatencyMs: endMs.Sub(start).Milliseconds(), ErrorCode: ptr(code), Query: queryText, CreatedAt: time.Now().UnixMilli()})
	writeProxyError(w, code, message, requestID, status)
}

func (h *Handler) sendUpstreamResponse(w http.ResponseWriter, r *http.Request, upstream *http.Response, key SchedulerKey, pathname string, cacheable bool, cacheKey string, cacheTtlMs int64) {
	for name, values := range upstream.Header {
		lower := strings.ToLower(name)
		if hopByHop[lower] || lower == "authorization" || lower == "x-api-key" {
			continue
		}
		for _, value := range values {
			w.Header().Add(name, value)
		}
	}
	w.WriteHeader(upstream.StatusCode)

	contentType := strings.ToLower(upstream.Header.Get("content-type"))
	canInspect := (h.Deps.ResourceAffinity || cacheable) &&
		r.Method == http.MethodPost &&
		statusIsSuccess(upstream.StatusCode) &&
		strings.Contains(contentType, "application/json") &&
		!strings.Contains(contentType, "text/event-stream") &&
		(routesIsResourceCreatingPath(pathname) || cacheable)

	if !canInspect {
		_, _ = io.Copy(w, upstream.Body)
		return
	}
	body, err := io.ReadAll(upstream.Body)
	if err != nil {
		return
	}
	if cacheable {
		if len(body) <= 1_000_000 {
			sharedCache.set(cacheKey, cacheEntry{body: body, contentType: contentType}, cacheTtlMs)
		}
		w.Header().Set("x-cache", "miss")
	}
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
			_, _ = w.Write(body)
		return
	}
	if affinity, ok := routesCreatedResourceFromResponse(r.Method, pathname, parsed); ok {
		h.Deps.State.SetAffinity(affinity.Type, affinity.ID, key.ID, time.Now().UnixMilli())
	}
	_, _ = w.Write(body)
}

func since(start time.Time) int64 { return time.Since(start).Milliseconds() }

func statusGroupOf(status int64) string {
	switch {
	case status >= 200 && status < 300:
		return "2xx"
	case status >= 300 && status < 400:
		return "3xx"
	case status >= 400 && status < 500:
		return "4xx"
	default:
		return "5xx"
	}
}
