// Package adminapi implements the /_proxy management surface consumed by the
// static console: same routes, JSON shapes and auth semantics as the
// TypeScript implementation.
package adminapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/apaidedie/exa-gate/internal/config"
	"github.com/apaidedie/exa-gate/internal/keycrypt"
	"github.com/apaidedie/exa-gate/internal/metrics"
	"github.com/apaidedie/exa-gate/internal/scheduler"
	"github.com/apaidedie/exa-gate/internal/state"
)

const Version = "2.1.0"

type Server struct {
	startTime time.Time
	Cfg       config.Config
	Store     *state.Store
	Scheduler *scheduler.Scheduler

	webhookMu       sync.Mutex
	webhookLastSent time.Time

	loginMu       sync.Mutex
	loginFailures map[string][]int64 // IP -> timestamps of failed logins
}

// isLockedOut checks if the given IP has exceeded the failed login threshold.
func (s *Server) isLockedOut(ip string) (bool, int64) {
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	now := time.Now().UnixMilli()
	windowStart := now - s.Cfg.AdminLockoutWindowSeconds * 1000
	var recent []int64
	for _, ts := range s.loginFailures[ip] {
		if ts >= windowStart {
			recent = append(recent, ts)
		}
	}
	s.loginFailures[ip] = recent
	if int64(len(recent)) >= int64(s.Cfg.AdminLockoutMaxFailures) {
		oldest := recent[0]
		remaining := (oldest + s.Cfg.AdminLockoutSeconds*1000 - now) / 1000
		if remaining < 1 {
			remaining = 1
		}
		return true, remaining
	}
	return false, 0
}

// recordLoginFailure tracks a failed login attempt for lockout.
func (s *Server) recordLoginFailure(ip string) {
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	if s.loginFailures == nil {
		s.loginFailures = map[string][]int64{}
	}
	s.loginFailures[ip] = append(s.loginFailures[ip], time.Now().UnixMilli())
}

// ---- shared helpers ----

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorBody(code, message, requestID string) map[string]any {
	return map[string]any{
		"error": map[string]string{
			"type": "proxy_error", "code": code, "message": message, "requestId": requestID,
		},
	}
}

func writeError(w http.ResponseWriter, status int, code, message, requestID string) {
	writeJSON(w, status, errorBody(code, message, requestID))
}

func requestIDOf(r *http.Request) string {
	if value := r.Header.Get("x-request-id"); value != "" {
		return value
	}
	return newRequestID()
}

func newRequestID() string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	return "req_" + hex.EncodeToString(buf)
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("x-forwarded-for"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		host = host[:idx]
	}
	return strings.Trim(host, "[]")
}

// requireAdmin enforces the auth contract: direct Bearer admin token or a
// valid x-admin-session-id session; optional HTTPS forwarding enforcement
// and login lockout.
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if s.Cfg.AdminRequireHTTPS {
		if r.Header.Get("x-forwarded-proto") != "https" && !strings.HasPrefix(r.Host, "127.0.0.1") && !strings.HasPrefix(r.Host, "localhost") {
			w.Header().Set("alt-svc", "h2")
			writeError(w, http.StatusUpgradeRequired, "admin_https_required", "Admin interface requires HTTPS forwarding.", requestIDOf(r))
			return false
		}
	}
	if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/session") {
		return true // login endpoint self-guards (lockout handled there)
	}
	if s.authorized(r) {
		return true
	}
	writeError(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", requestIDOf(r))
	return false
}

func (s *Server) authorized(r *http.Request) bool {
	if sessionID := r.Header.Get("x-admin-session-id"); sessionID != "" {
		session, err := s.Store.GetSession(sessionID)
		if err == nil && session.ExpiresAt > time.Now().UnixMilli() {
			_ = s.Store.TouchSession(sessionID, time.Now().UnixMilli())
			return true
		}
		return false
	}
	bearer := r.Header.Get("authorization")
	if strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		token := strings.TrimSpace(bearer[len("Bearer "):])
		for _, allowed := range s.Cfg.AdminTokens {
			if token == allowed {
				return true
			}
		}
	}
	return false
}

func (s *Server) audit(r *http.Request, action string, target *string, success bool, detail string) {
	actor := s.actorID(r)
	var ip, ua *string
	if value := clientIP(r); value != "" {
		ip = &value
	}
	if value := r.Header.Get("user-agent"); value != "" {
		ua = &value
	}
	var targetPtr *string
	if target != nil {
		targetPtr = target
	}
	var detailPtr *string
	if detail != "" {
		detailPtr = &detail
	}
	_ = s.Store.RecordAudit(state.AuditRecord{
		ActorTokenID: &actor, Action: action, TargetID: targetPtr,
		Success: success, Detail: detailPtr, IP: ip, UserAgent: ua,
		CreatedAt: time.Now().UnixMilli(),
	})
}

func (s *Server) actorID(r *http.Request) string {
	if sessionID := r.Header.Get("x-admin-session-id"); sessionID != "" {
		if session, err := s.Store.GetSession(sessionID); err == nil {
			return session.TokenID
		}
	}
	if bearer := r.Header.Get("authorization"); strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		token := strings.TrimSpace(bearer[len("Bearer "):])
		for _, allowed := range s.Cfg.AdminTokens {
			if token == allowed {
				return keycrypt.TokenID(token)
			}
		}
	}
	return "-"
}

// ---- key stats shaping for the console ----

type keyView struct {
	ID                    string  `json:"id"`
	Enabled               bool    `json:"enabled"`
	Weight                int     `json:"weight"`
	TotalRequests         int64   `json:"totalRequests"`
	SuccessCount          int64   `json:"successCount"`
	FailureCount          int64   `json:"failureCount"`
	RetryCount            int64   `json:"retryCount"`
	RateLimitCount        int64   `json:"rateLimitCount"`
	TimeoutCount          int64   `json:"timeoutCount"`
	CreditsExhaustedCount int64   `json:"creditsExhaustedCount"`
	CooldownUntil         int64   `json:"cooldownUntil"`
	CooldownReason        *string `json:"cooldownReason"`
	LastStatus            *int64  `json:"lastStatus"`
	LastError             *string `json:"lastError"`
	LastLatencyMs         *int64  `json:"lastLatencyMs"`
	LastSuccessAt         *int64  `json:"lastSuccessAt"`
	LastFailureAt         *int64  `json:"lastFailureAt"`
	DisplayID             string  `json:"displayId"`
	RawKeyDisplayAllowed  bool    `json:"rawKeyDisplayAllowed"`
}

// keyValueFor reads and DECRYPTS the stored key value. Returns nil when
// the key has no stored ciphertext (ENV-seeded only) or decryption fails.
func (s *Server) keyValueFor(id string) (*string, bool) {
	encrypted, err := s.Store.GetKeyValue(id)
	if err != nil || encrypted == nil || *encrypted == "" {
		return nil, false
	}
	plaintext, err := keycrypt.Decrypt(*encrypted, s.Cfg.EncryptionSecret)
	if err != nil {
		return nil, false
	}
	return &plaintext, true
}

func (s *Server) keyViews() ([]keyView, error) {
	stats, err := s.Store.ListKeyStats()
	if err != nil {
		return nil, err
	}
	out := make([]keyView, 0, len(stats))
	for _, stat := range stats {
		view := keyView{
			ID: stat.ID, Enabled: stat.Enabled, Weight: stat.Weight,
			TotalRequests: stat.TotalRequests, SuccessCount: stat.SuccessCount,
			FailureCount: stat.FailureCount, RetryCount: stat.RetryCount,
			RateLimitCount: stat.RateLimitCount, TimeoutCount: stat.TimeoutCount,
			CreditsExhaustedCount: stat.CreditsExhaustedCount,
			CooldownUntil:         stat.CooldownUntil, CooldownReason: stat.CooldownReason,
			LastStatus: stat.LastStatus, LastError: stat.LastError,
			LastLatencyMs: stat.LastLatencyMs, LastSuccessAt: stat.LastSuccessAt,
			LastFailureAt:        stat.LastFailureAt,
			DisplayID:            stat.ID,
			RawKeyDisplayAllowed: s.Cfg.AllowRawKeyDisplay,
		}
		if s.Cfg.AllowRawKeyDisplay {
			if value, ok := s.keyValueFor(stat.ID); ok && value != nil && *value != "" {
				view.DisplayID = *value
			}
		}
		out = append(out, view)
	}
	return out, nil
}

// ---- route registration ----

func (s *Server) Init() {
	s.startTime = time.Now()
	s.loginFailures = make(map[string][]int64)
}

func (s *Server) Register(mux *http.ServeMux) {
	mux.HandleFunc("/_proxy/live", s.handleLive)
	mux.HandleFunc("/_proxy/ready", s.handleReady)
	mux.HandleFunc("/_proxy/health", s.handleHealth)
	mux.HandleFunc("/_proxy/session", s.handleSession)
	mux.HandleFunc("/_proxy/sessions", s.handleSessions)
	mux.HandleFunc("/_proxy/keys", s.handleKeys)
	mux.HandleFunc("/_proxy/keys/export", s.handleKeysExport)
	mux.HandleFunc("/_proxy/keys/batch", s.handleKeysBatch)
	mux.HandleFunc("/_proxy/keys/import", s.handleKeysImport)
	mux.HandleFunc("/_proxy/keys/", s.handleKeyItem)
	mux.HandleFunc("/_proxy/logs", s.handleLogs)
	mux.HandleFunc("/_proxy/logs/export", s.handleLogsExport)
	mux.HandleFunc("/_proxy/logs/prune", s.handleLogsPrune)
	mux.HandleFunc("/_proxy/logs/trace/", s.handleLogTrace)
	mux.HandleFunc("/_proxy/observability", s.handleObservability)
	mux.HandleFunc("/_proxy/metrics", s.handleMetrics)
	mux.HandleFunc("/_proxy/events", s.handleEvents)
	mux.HandleFunc("/_proxy/audit", s.handleAudit)
	mux.HandleFunc("/_proxy/audit/export", s.handleAuditExport)
	mux.HandleFunc("/_proxy/alerts/webhook/test", s.handleWebhookTest)
	mux.HandleFunc("/_proxy/config-summary", s.handleConfigSummary)
}

func (s *Server) handleLive(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (s *Server) keyOperations() (total, healthy, cooldown, disabled int64) {
	stats, err := s.Store.ListKeyStats()
	if err != nil {
		return 0, 0, 0, 0
	}
	now := time.Now().UnixMilli()
	for _, stat := range stats {
		total++
		switch {
		case !stat.Enabled:
			disabled++
		case stat.CooldownUntil > now:
			cooldown++
		default:
			healthy++
		}
	}
	return
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	_, healthy, _, _ := s.keyOperations()
	if healthy == 0 {
		writeJSON(w, 503, map[string]any{"ok": false, "ready": false, "status": "not_ready", "reason": "no_available_keys"})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "ready": true, "status": "ready"})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	total, healthy, cooldown, disabled := s.keyOperations()
	writeJSON(w, 200, map[string]any{
		"ok": true, "status": "healthy",
		"keys": map[string]any{"total": total, "healthy": healthy, "cooldown": cooldown, "disabled": disabled},
		"alertCount": 0, "timestamp": time.Now().UnixMilli(),
		"uptimeSeconds": time.Since(s.startTime).Milliseconds() / 1000,
	})
}

// ---- session ----

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.handleSessionLogin(w, r)
	case http.MethodDelete:
		if !s.requireAdmin(w, r) {
			return
		}
		if sessionID := r.Header.Get("x-admin-session-id"); sessionID != "" {
			_ = s.Store.DeleteSession(sessionID)
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	default:
		writeError(w, 405, "method_not_allowed", "Use POST or DELETE.", requestIDOf(r))
	}
}

func (s *Server) handleSessionLogin(w http.ResponseWriter, r *http.Request) {
	bearer := r.Header.Get("authorization")
	token := ""
	if strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		token = strings.TrimSpace(bearer[len("Bearer "):])
	}
	ip := clientIP(r)
	if locked, remaining := s.isLockedOut(ip); locked {
		s.audit(r, "admin_login", nil, false, fmt.Sprintf("locked out, %ds remaining", remaining))
		w.Header().Set("retry-after", fmt.Sprintf("%d", remaining))
		writeError(w, http.StatusTooManyRequests, "too_many_attempts", fmt.Sprintf("Too many failed attempts. Try again in %d seconds.", remaining), requestIDOf(r))
		return
	}
	matched := ""
	for _, allowed := range s.Cfg.AdminTokens {
		if token == allowed {
			matched = allowed
			break
		}
	}
	if matched == "" {
		s.recordLoginFailure(ip)
		s.audit(r, "admin_login", nil, false, "invalid admin token")
		writeError(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", requestIDOf(r))
		return
	}
	now := time.Now().UnixMilli()
	sessionIDBytes := make([]byte, 16)
	_, _ = rand.Read(sessionIDBytes)
	sessionID := hex.EncodeToString(sessionIDBytes)
	expiresAt := now + s.Cfg.AdminSessionTTLSeconds*1000
	if err := s.Store.CreateSession(state.AdminSession{
		ID: sessionID, TokenID: keycrypt.TokenID(matched),
		CreatedAt: now, ExpiresAt: expiresAt, LastSeenAt: now,
	}); err != nil {
		writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
		return
	}
	s.audit(r, "admin_login", nil, true, "session created")
	writeJSON(w, 200, map[string]any{
		"ok": true, "sessionId": sessionID,
		"tokenId": keycrypt.TokenID(matched), "expiresAt": expiresAt,
	})
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		sessions, err := s.Store.ListActiveSessions(time.Now().UnixMilli())
		if err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
			return
		}
		writeJSON(w, 200, map[string]any{"sessions": sessions})
	case http.MethodPost:
		var body struct {
			SessionID string `json:"sessionId"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.SessionID == "" {
			writeError(w, 400, "validation_error", "sessionId is required.", requestIDOf(r))
			return
		}
		_ = s.Store.DeleteSession(body.SessionID)
		s.audit(r, "revoke_session", &body.SessionID, true, "session revoked by operator")
		writeJSON(w, 200, map[string]any{"ok": true})
	default:
		writeError(w, 405, "method_not_allowed", "Use GET or POST.", requestIDOf(r))
	}
}

// ---- keys ----

func (s *Server) handleKeys(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		views, err := s.keyViews()
		if err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
			return
		}
		writeJSON(w, 200, map[string]any{
			"keys":      views,
			"scheduler": s.Scheduler.Snapshot(time.Now().UnixMilli()),
		})
	case http.MethodPost:
		var body struct {
			ID     string `json:"id"`
			Value  string `json:"value"`
			Weight *int   `json:"weight"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		requestID := requestIDOf(r)
		id := strings.TrimSpace(body.ID)
		value := strings.TrimSpace(body.Value)
		weight := 1
		if body.Weight != nil {
			weight = *body.Weight
		}
		if id == "" {
			s.audit(r, "create_key", nil, false, "Missing key id")
			writeError(w, 400, "validation_error", "Key id is required.", requestID)
			return
		}
		if value == "" {
			s.audit(r, "create_key", &id, false, "Missing key value")
			writeError(w, 400, "validation_error", "Key value is required.", requestID)
			return
		}
		if weight < 1 {
			s.audit(r, "create_key", &id, false, "Invalid weight")
			writeError(w, 400, "validation_error", "Weight must be a positive integer.", requestID)
			return
		}
		if _, exists := s.Scheduler.GetKey(id); exists {
			s.audit(r, "create_key", &id, false, "Key already exists")
			writeError(w, 409, "key_exists", fmt.Sprintf("Key with id '%s' already exists.", id), requestID)
			return
		}
		encrypted, err := keycrypt.Encrypt(value, s.Cfg.EncryptionSecret)
		if err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestID)
			return
		}
		if err := s.Store.SeedKeys([]state.KeySeed{{ID: id, Value: &encrypted, Weight: weight, Enabled: true}}); err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestID)
			return
		}
		s.Scheduler.AddKey(scheduler.Key{ID: id, Value: value, Weight: weight, Enabled: true})
		s.audit(r, "create_key", &id, true, "Key created")
		writeJSON(w, 200, map[string]any{"ok": true, "id": id, "weight": weight, "enabled": true})
	default:
		writeError(w, 405, "method_not_allowed", "Use GET or POST.", requestIDOf(r))
	}
}

func (s *Server) handleKeyItem(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/_proxy/keys/"), "/")
	id := parts[0]
	sub := ""
	if len(parts) > 1 {
		sub = parts[1]
	}
	requestID := requestIDOf(r)
	audit := func(action string, success bool, detail string) {
		s.audit(r, action, &id, success, detail)
	}

	switch {
	case r.Method == http.MethodGet && sub == "failures":
		logs, err := s.Store.ListKeyFailureLogs(id, 20)
		if err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestIDOf(r))
			return
		}
		reasons := map[string]int64{}
		var lastFailureAt *int64
		for _, log := range logs {
			if log.ErrorCode != nil {
				reasons[*log.ErrorCode]++
			}
			if lastFailureAt == nil || log.CreatedAt > *lastFailureAt {
				latest := log.CreatedAt
				lastFailureAt = &latest
			}
		}
		writeJSON(w, 200, map[string]any{"summary": map[string]any{"reasons": reasons, "lastFailureAt": lastFailureAt}})
	case r.Method == http.MethodGet && sub == "secret":
		if !s.Cfg.AllowRawKeyDisplay {
			audit("reveal_key_secret", false, "Raw key display disabled")
			writeError(w, 403, "raw_key_display_disabled", "Raw key display is disabled by policy.", requestID)
			return
		}
		if value, ok := s.keyValueFor(id); ok && value != nil && *value != "" {
			audit("reveal_key_secret", true, "Raw key revealed")
			writeJSON(w, 200, map[string]any{"ok": true, "id": id, "secret": *value})
			return
		}
		audit("reveal_key_secret", false, "Key not found")
		writeError(w, 404, "key_not_found", "The selected upstream key was not found.", requestID)
	case r.Method == http.MethodPut && sub == "":
		var body struct {
			Value   *string `json:"value"`
			Weight  *int    `json:"weight"`
			Enabled *bool   `json:"enabled"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if _, exists := s.Scheduler.GetKey(id); !exists {
			audit("update_key", false, "Key not found")
			writeError(w, 404, "key_not_found", fmt.Sprintf("Key with id '%s' was not found.", id), requestID)
			return
		}
		var updated []string
		if body.Value != nil && strings.TrimSpace(*body.Value) != "" {
			encrypted, err := keycrypt.Encrypt(strings.TrimSpace(*body.Value), s.Cfg.EncryptionSecret)
			if err != nil {
				writeError(w, 500, "internal_error", err.Error(), requestID)
				return
			}
			_ = s.Store.SeedKeys([]state.KeySeed{{ID: id, Value: &encrypted, Weight: 1, Enabled: true}})
			_ = s.Scheduler // value not held by scheduler in Go; upstream reads from state
			updated = append(updated, "value")
		}
		if body.Weight != nil {
			if *body.Weight < 1 {
				audit("update_key", false, "Invalid weight")
				writeError(w, 400, "validation_error", "Weight must be a positive integer.", requestID)
				return
			}
			_ = s.Store.SeedKeys([]state.KeySeed{{ID: id, Weight: *body.Weight, Enabled: true}})
			updated = append(updated, "weight")
		}
		if body.Enabled != nil {
			_ = s.Store.SetEnabled(id, *body.Enabled)
			s.Scheduler.SetDisabled(id, !*body.Enabled)
			updated = append(updated, "enabled")
		}
		detail := "Updated: " + strings.Join(updated, ", ")
		audit("update_key", true, detail)
		writeJSON(w, 200, map[string]any{"ok": true, "id": id})
	case r.Method == http.MethodDelete && sub == "":
		count, err := s.Store.KeyCount()
		if err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestID)
			return
		}
		if count <= 1 {
			audit("delete_key", false, "Cannot delete last key")
			writeError(w, 409, "last_key", "Cannot delete the last remaining key. At least one key is required.", requestID)
			return
		}
		if err := s.Store.DeleteKey(id); err != nil {
			writeError(w, 500, "internal_error", err.Error(), requestID)
			return
		}
		s.Scheduler.RemoveKey(id)
		audit("delete_key", true, "Key deleted")
		writeJSON(w, 200, map[string]any{"ok": true, "id": id})
	case r.Method == http.MethodPost && sub == "test":
		key, exists := s.Scheduler.GetKey(id)
		if !exists {
			audit("test_key", false, "Key not found")
			writeError(w, 404, "key_not_found", "The selected upstream key was not found.", requestID)
			return
		}
		result := s.testKey(key, requestID)
		audit("test_key", result["ok"] == true, fmt.Sprintf("status %v, reason %v", result["status"], result["reason"]))
		writeJSON(w, 200, result)
	case r.Method == http.MethodPost && sub == "disable":
		_ = s.Store.SetEnabled(id, false)
		s.Scheduler.SetDisabled(id, true)
		audit("disable_key", true, "Key disabled")
		writeJSON(w, 200, map[string]any{"ok": true, "id": id, "enabled": false})
	case r.Method == http.MethodPost && sub == "enable":
		_ = s.Store.SetEnabled(id, true)
		s.Scheduler.SetDisabled(id, false)
		audit("enable_key", true, "Key enabled")
		writeJSON(w, 200, map[string]any{"ok": true, "id": id, "enabled": true})
	case r.Method == http.MethodPost && sub == "reset-circuit":
		s.Scheduler.CoolDown(id, 0, "manual_reset")
		_ = s.Store.SetCooldown(id, 0, nil)
		audit("reset_circuit", true, "Cooldown reset")
		writeJSON(w, 200, map[string]any{"ok": true, "id": id})
	default:
		writeError(w, 404, "route_not_found", "Unknown key action.", requestID)
	}
}

// testKey performs a lightweight upstream check without consuming credits:
// GET / with the key must return 401/403-class auth response, proving the
// credential is accepted shape-wise... — actual check mirrors the Node
// implementation: POST /search with a minimal query.
func (s *Server) testKey(key scheduler.Key, requestID string) map[string]any {
	start := time.Now()
	client := &http.Client{Timeout: 10 * time.Second}
	payload := strings.NewReader(`{"query":"Exa key health check","numResults":1}`)
	req, err := http.NewRequest(http.MethodPost, s.Cfg.UpstreamURL+"/search", payload)
	if err != nil {
		return map[string]any{"ok": false, "id": key.ID, "status": 0, "latencyMs": 0, "reason": "unknown_error"}
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", key.Value)
	req.Header.Set("x-request-id", requestID)
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		_ = s.Store.RecordAttempt(state.AttemptRecord{KeyID: key.ID, Success: false, LatencyMs: float64(latency), Reason: "connection_error"})
		return map[string]any{"ok": false, "id": key.ID, "status": 0, "latencyMs": latency, "reason": "connection_error"}
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	success := resp.StatusCode >= 200 && resp.StatusCode < 400
	reason := "ok"
	switch resp.StatusCode {
	case 429:
		reason = "rate_limit"
	case 402:
		reason = "credits_exhausted"
	default:
		if resp.StatusCode >= 400 {
			reason = "upstream_error"
		}
	}
	_ = s.Store.RecordAttempt(state.AttemptRecord{
		KeyID: key.ID, Status: ptrInt64(int64(resp.StatusCode)), Success: success,
		LatencyMs: float64(latency), Reason: reason,
	})
	_ = s.Store.RecordRequestLog(state.RequestLog{
		RequestID: requestID, Method: "POST", Path: "/search",
		Status: int64(resp.StatusCode), KeyIDs: []string{key.ID}, Attempts: 1,
		LatencyMs: latency, Query: ptrString("Exa key health check"),
		CreatedAt: time.Now().UnixMilli(),
	})
	if reason == "rate_limit" {
		until := time.Now().UnixMilli() + s.Cfg.RateLimitCooldownSeconds*1000
		s.Scheduler.CoolDown(key.ID, until, "rate_limit")
		_ = s.Store.SetCooldown(key.ID, until, ptrString("rate_limit"))
	} else if reason == "credits_exhausted" {
		s.Scheduler.SetDisabled(key.ID, true)
		_ = s.Store.SetEnabled(key.ID, false)
	} else if success {
		s.Scheduler.RecordSuccess(key.ID)
	}
	return map[string]any{"ok": success, "id": key.ID, "status": resp.StatusCode, "latencyMs": latency, "reason": reason}
}

func ptrInt64(v int64) *int64    { return &v }
func ptrString(v string) *string { return &v }

// metricsRender delegates to the metrics package to keep exposition names in
// one place.
func metricsRender(stats []state.KeyStats, total, healthy, cooldown, disabled, p95 int64, retentionDays int) string {
	out := make([]metrics.Stats, 0, len(stats))
	for _, stat := range stats {
		out = append(out, metrics.Stats{
			ID: stat.ID, TotalRequests: stat.TotalRequests, SuccessCount: stat.SuccessCount,
			FailureCount: stat.FailureCount, RateLimitCount: stat.RateLimitCount,
			TimeoutCount: stat.TimeoutCount, CreditsExhaustedCount: stat.CreditsExhaustedCount,
			CooldownUntil: stat.CooldownUntil,
		})
	}
	return metrics.RenderPrometheus(out, metrics.Operations{
		TotalKeys: total, HealthyKeys: healthy, CooldownKeys: cooldown, DisabledKeys: disabled,
	}, 0, int64(retentionDays), p95)
}

func schedulerKeyFromSeed(id, value string, weight int) scheduler.Key {
	return scheduler.Key{ID: id, Value: value, Weight: weight, Enabled: true}
}
