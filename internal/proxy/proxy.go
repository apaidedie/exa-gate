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

// cacheWrite carries the search-cache bookkeeping for a cacheable response.
type cacheWrite struct {
	key   string
	ttlMs int64
}

// UpstreamDoer performs one upstream attempt ("er" suffix per the
// single-method interface naming convention).
type UpstreamDoer interface {
	// Do sends one upstream attempt and returns the response with body
	// unconsumed. The body must be closed by the caller.
	Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error)
}

type Deps struct {
	Upstream                 UpstreamDoer
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
	// RateLimiter enforces EXA_PROXY_RATE_LIMIT_PER_MINUTE per client token;
	// nil = unlimited.
	RateLimiter *TokenLimiter
}

type SchedulerKey struct {
	ID    string
	Value string
}

const headerContentType = "content-type"

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
	w.Header().Set(headerContentType, "application/json")
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

// responseCache mirrors the TypeScript cache: 500 entries with a 1MB-per-
// entry body cap. When full, the entry expiring soonest is evicted (expired
// entries always evict first).
type cacheEntry struct {
	body        []byte
	contentType string
	expiresAt   int64
}

type responseCache struct {
	mu      sync.Mutex
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
	return entry, true
}

func (c *responseCache) set(key string, entry cacheEntry, ttlMs int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry.expiresAt = time.Now().UnixMilli() + ttlMs
	if len(c.entries) >= cacheMaxEntries {
		// Evict the entry that expires soonest: among live entries this is
		// the least valuable to keep, and expired entries always sort first.
		var oldestKey string
		oldest := int64(1) << 62
		for k, v := range c.entries {
			if v.expiresAt < oldest {
				oldest, oldestKey = v.expiresAt, k
			}
		}
		delete(c.entries, oldestKey)
	}
	c.entries[key] = entry
}

func statusIsSuccess(status int) bool       { return status >= 200 && status < 300 }
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
	Deps         Deps
	UpstreamBase string
}

func ptr[T any](value T) *T { return &value }

func (h *Handler) recordAttempt(keyID string, status *int64, success bool, latencyMs float64, isRetry bool, reason string) {
	h.Deps.State.RecordAttempt(state.AttemptRecord{KeyID: keyID, Status: status, Success: success, LatencyMs: latencyMs, Retry: isRetry, Reason: reason})
}

// requestState carries per-request proxy bookkeeping across the handler
// phases (auth -> policy -> body -> cache -> forward -> respond).
type requestState struct {
	requestID   string
	tokenID     *string
	body        []byte
	queryText   *string
	cacheable   bool
	cacheKey    string
	cacheTtlMs  int64
	affinityKey *SchedulerKey
	keyIDs      []string
}

// ServeHTTP implements the full proxy contract: auth, per-token rate limit,
// path policy, bounded body read, search cache, key rotation with retry and
// failover, resource affinity and request logging.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	pathname := pathnameOf(r)
	requestID := r.Header.Get("x-request-id")
	if requestID == "" {
		requestID = fmt.Sprintf("req_%d", start.UnixNano())
	}
	presented := extractToken(r.Header.Get("authorization"), r.Header.Get("x-proxy-api-key"))
	var tokenIDPtr *string
	if id := tokenIDFor(presented, h.Deps.ProxyTokens); id != "" {
		tokenIDPtr = ptr(id)
	}

	if !isAuthorized(presented, h.Deps.ProxyTokens) {
		h.reject(w, r, requestID, tokenIDPtr, pathname, start, 401, "unauthorized", "Unauthorized")
		return
	}
	// Per-token rate limit (nil limiter = unlimited): enforce right after
	// auth so an over-limit client never reaches upstream work.
	if tokenIDPtr != nil && !h.Deps.RateLimiter.Allow(*tokenIDPtr) {
		w.Header().Set("retry-after", "60")
		h.reject(w, r, requestID, tokenIDPtr, pathname, start, 429, "rate_limited", "Proxy rate limit exceeded for this token. Try again shortly.")
		return
	}
	if !routesIsAllowedPath(pathname, h.Deps.AllowedPaths) {
		h.reject(w, r, requestID, tokenIDPtr, pathname, start, 403, "route_forbidden", "This Exa route is not allowed by proxy configuration.")
		return
	}

	rs := &requestState{requestID: requestID, tokenID: tokenIDPtr}
	if !h.readRequestBody(w, r, rs, start) {
		return
	}
	h.prepareCache(r, rs)
	if h.serveCached(w, r, rs, start) {
		return
	}
	if h.Deps.ResourceAffinity {
		rs.affinityKey = h.resolveAffinity(r)
	}

	finalStatus, lastResponse, lastErrorReason := h.forwardUpstream(r, rs, map[string]bool{})
	if lastResponse != nil {
		defer lastResponse.Body.Close()
		h.respondUpstream(w, r, rs, pathname, start, finalStatus, lastResponse)
		return
	}
	h.respondError(w, r, rs, pathname, start, finalStatus, lastErrorReason)
}

// reject logs a rejected request and writes the proxy error body.
func (h *Handler) reject(w http.ResponseWriter, r *http.Request, requestID string, tokenID *string, pathname string, start time.Time, status int64, code, message string) {
	h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: requestID, TokenID: tokenID, Method: r.Method, Path: pathname, Status: status, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr(code), CreatedAt: time.Now().UnixMilli()})
	writeProxyError(w, code, message, requestID, int(status))
}

// readRequestBody reads a bounded body for body-bearing methods. Returns
// false when a 400/413 response has already been written.
func (h *Handler) readRequestBody(w http.ResponseWriter, r *http.Request, rs *requestState, start time.Time) bool {
	if r.Body == nil || r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, h.Deps.MaxBodyBytes+1))
	if err != nil {
		writeProxyError(w, "bad_request", "Failed to read request body.", rs.requestID, 400)
		return false
	}
	if int64(len(body)) > h.Deps.MaxBodyBytes {
		h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: rs.requestID, TokenID: rs.tokenID, Method: r.Method, Path: pathnameOf(r), Status: 413, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr("body_too_large"), CreatedAt: time.Now().UnixMilli()})
		writeProxyError(w, "body_too_large", "Request body exceeds the configured limit.", rs.requestID, 413)
		return false
	}
	rs.body = body
	return true
}

// prepareCache computes the extracted query text and, for cacheable /search
// requests, the response-cache key.
func (h *Handler) prepareCache(r *http.Request, rs *requestState) {
	rs.cacheTtlMs = h.Deps.SearchCacheTTLSeconds * 1000
	rs.cacheable = rs.cacheTtlMs > 0 && r.Method == http.MethodPost && pathnameOf(r) == "/search" && rs.body != nil
	rs.queryText = extractQuery(rs.body)
	if !rs.cacheable {
		return
	}
	sum := sha256.Sum256(rs.body)
	rs.cacheKey = fmt.Sprintf("%x", sum)
}

// serveCached answers a cacheable request from the response cache. Returns
// false on miss (after recording the miss metric).
func (h *Handler) serveCached(w http.ResponseWriter, r *http.Request, rs *requestState, start time.Time) bool {
	if !rs.cacheable {
		return false
	}
	cached, ok := sharedCache.get(rs.cacheKey)
	if !ok {
		metricsRecordCacheMiss()
		return false
	}
	metricsRecordCacheHit()
	h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: rs.requestID, TokenID: rs.tokenID, Method: r.Method, Path: pathnameOf(r), Status: 200, Attempts: 0, LatencyMs: since(start), ErrorCode: ptr("cache_hit"), Query: rs.queryText, CreatedAt: time.Now().UnixMilli()})
	w.Header().Set(headerContentType, cached.contentType)
	w.Header().Set("x-cache", "hit")
	w.WriteHeader(200)
	_, _ = w.Write(cached.body)
	return true
}

// resolveAffinity pins a request to the key that created the resource, when
// affinity is enabled and the binding still resolves to an eligible key.
func (h *Handler) resolveAffinity(r *http.Request) *SchedulerKey {
	affinity, ok := routesParseResourceAffinity(pathnameOf(r))
	if !ok {
		return nil
	}
	keyID, err := h.Deps.State.GetAffinity(affinity.Type, affinity.ID)
	if err != nil || keyID == "" {
		return nil
	}
	if key, found := h.Deps.GetByID(keyID, time.Now().UnixMilli()); found {
		return &key
	}
	return nil
}

// maxAttemptsFor clamps the configured attempt count; unsafe-to-retry
// requests always get exactly one attempt.
func (h *Handler) maxAttemptsFor(safeToRetry bool) int {
	attempts := h.Deps.MaxAttempts
	if attempts < 1 {
		attempts = 1
	}
	if !safeToRetry {
		attempts = 1
	}
	return attempts
}

// pickKey uses the affinity key on the first attempt and the scheduler
// afterwards, excluding keys that already failed this request.
func (h *Handler) pickKey(rs *requestState, attempted map[string]bool, attempt int, now int64) (SchedulerKey, bool) {
	if attempt == 0 && rs.affinityKey != nil {
		return *rs.affinityKey, true
	}
	return h.Deps.NextKey(now, attempted)
}

// pauseBeforeRetry waits out the configured backoff for the attempt index.
func (h *Handler) pauseBeforeRetry(attempt int) {
	time.Sleep(time.Duration(backoffMs(h.Deps.RetryBackoffMs, attempt)) * time.Millisecond)
}

// forwardUpstream drives the attempt/failover loop. Returns the final status,
// the last response (nil when every attempt failed at transport level) and
// the last classified reason.
func (h *Handler) forwardUpstream(r *http.Request, rs *requestState, attempted map[string]bool) (int64, *http.Response, string) {
	var (
		finalStatus     int64 = 503
		lastResponse    *http.Response
		lastErrorReason = "unknown_error"
	)
	maxAttempts := h.maxAttemptsFor(routesIsRetrySafe(r.Method, pathnameOf(r), headerBag(r)))
	for attempt := 0; attempt < maxAttempts; attempt++ {
		now := time.Now().UnixMilli()
		key, ok := h.pickKey(rs, attempted, attempt, now)
		if !ok {
			break
		}
		attempted[key.ID] = true
		rs.keyIDs = append(rs.keyIDs, key.ID)
		attemptStart := time.Now()

		upstream, err := h.Deps.Upstream.Do(pathAndQuery(r), r.Method, upstreamHeaders(r, key.Value, rs.requestID), rs.body, h.Deps.AttemptTimeoutMs, r.Context().Done())
		latencyMs := float64(time.Since(attemptStart).Milliseconds())
		if err != nil {
			reason := retryClassifyError(err)
			lastErrorReason = reason
			h.recordAttempt(key.ID, nil, false, latencyMs, attempt > 0, reason)
			if until, tripped := h.Deps.RecordFailure(key.ID, time.Now().UnixMilli(), h.Deps.FailureThreshold, h.Deps.FailureWindowSeconds*1000, h.Deps.CooldownSeconds*1000, reason); tripped {
				h.Deps.State.SetCooldown(key.ID, until, ptr(reason))
			}
			if attempt == maxAttempts-1 {
				break
			}
			h.pauseBeforeRetry(attempt)
			continue
		}

		finalStatus = int64(upstream.StatusCode)
		lastResponse = upstream
		reason := retryClassifyStatus(upstream.StatusCode)
		lastErrorReason = reason
		h.reactToStatus(key, upstream, reason, now)
		if !retryable(reason) || attempt == maxAttempts-1 {
			break
		}
		// Drain the failed attempt body before backoff.
		_, _ = io.Copy(io.Discard, upstream.Body)
		_ = upstream.Body.Close()
		h.pauseBeforeRetry(attempt)
	}
	return finalStatus, lastResponse, lastErrorReason
}

// reactToStatus records a completed attempt and applies the rate-limit
// cooldown, credits-exhausted disable, failure circuit or success bookkeeping.
func (h *Handler) reactToStatus(key SchedulerKey, upstream *http.Response, reason string, now int64) {
	success := statusCountsAsSuccess(upstream.StatusCode)
	statusValue := int64(upstream.StatusCode)
	h.recordAttempt(key.ID, &statusValue, success, float64(time.Since(time.UnixMilli(now)).Milliseconds()), false, reason)

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
}

// respondUpstream writes the final upstream response with metrics, logging
// and cache bookkeeping.
func (h *Handler) respondUpstream(w http.ResponseWriter, r *http.Request, rs *requestState, pathname string, start time.Time, finalStatus int64, lastResponse *http.Response) {
	metricsRecordLatency(pathname, statusGroupOf(finalStatus), time.Since(start).Milliseconds())
	metricsRecordStatus(finalStatus)
	errorCode := logErrorCodeForUpstreamStatus(finalStatus)
	h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: rs.requestID, TokenID: rs.tokenID, Method: r.Method, Path: pathname, Status: finalStatus, KeyIDs: rs.keyIDs, Attempts: int64(len(rs.keyIDs)), LatencyMs: time.Since(start).Milliseconds(), ErrorCode: errorCode, Query: rs.queryText, CreatedAt: time.Now().UnixMilli()})
	if len(rs.keyIDs) == 0 {
		writeProxyError(w, "upstream_error", "The upstream Exa API could not be reached.", rs.requestID, 502)
		return
	}
	selectedKey, found := h.Deps.GetKey(rs.keyIDs[len(rs.keyIDs)-1])
	if !found {
		writeProxyError(w, "upstream_error", "The upstream key selection could not be resolved.", rs.requestID, 502)
		return
	}
	var cw *cacheWrite
	if rs.cacheable {
		cw = &cacheWrite{key: rs.cacheKey, ttlMs: rs.cacheTtlMs}
	}
	h.sendUpstreamResponse(w, r, lastResponse, selectedKey, pathname, cw)
}

// respondError writes the terminal failure when no upstream response exists.
func (h *Handler) respondError(w http.ResponseWriter, r *http.Request, rs *requestState, pathname string, start time.Time, finalStatus int64, lastErrorReason string) {
	if len(rs.keyIDs) == 0 {
		h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: rs.requestID, TokenID: rs.tokenID, Method: r.Method, Path: pathname, Status: 503, Attempts: 0, LatencyMs: time.Since(start).Milliseconds(), ErrorCode: ptr("no_healthy_keys"), CreatedAt: time.Now().UnixMilli()})
		writeProxyError(w, "no_healthy_keys", "No healthy Exa API key is currently available.", rs.requestID, 503)
		return
	}
	status, code, message := errorStatusForReason(lastErrorReason)
	metricsRecordLatency(pathname, statusGroupOf(finalStatus), time.Since(start).Milliseconds())
	metricsRecordStatus(int64(status))
	h.Deps.State.RecordRequestLog(state.RequestLog{RequestID: rs.requestID, TokenID: rs.tokenID, Method: r.Method, Path: pathname, Status: int64(status), KeyIDs: rs.keyIDs, Attempts: int64(len(rs.keyIDs)), LatencyMs: time.Since(start).Milliseconds(), ErrorCode: ptr(code), Query: rs.queryText, CreatedAt: time.Now().UnixMilli()})
	writeProxyError(w, code, message, rs.requestID, status)
}

func (h *Handler) sendUpstreamResponse(w http.ResponseWriter, r *http.Request, upstream *http.Response, key SchedulerKey, pathname string, cache *cacheWrite) {
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

	contentType := strings.ToLower(upstream.Header.Get(headerContentType))
	canInspect := (h.Deps.ResourceAffinity || cache != nil) &&
		r.Method == http.MethodPost &&
		statusIsSuccess(upstream.StatusCode) &&
		strings.Contains(contentType, "application/json") &&
		!strings.Contains(contentType, "text/event-stream") &&
		(routesIsResourceCreatingPath(pathname) || cache != nil)

	if !canInspect {
		_, _ = io.Copy(w, upstream.Body)
		return
	}
	body, err := io.ReadAll(upstream.Body)
	if err != nil {
		return
	}
	if cache != nil {
		if len(body) <= 1_000_000 {
			sharedCache.set(cache.key, cacheEntry{body: body, contentType: contentType}, cache.ttlMs)
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
