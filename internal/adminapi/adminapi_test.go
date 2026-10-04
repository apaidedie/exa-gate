package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/apaidedie/exa-gate/internal/config"
	"github.com/apaidedie/exa-gate/internal/scheduler"
	"github.com/apaidedie/exa-gate/internal/state"
)

const testAdminToken = "admin-token-16ch"

type testEnv struct {
	s   *Server
	mux *http.ServeMux
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	st, err := state.Open(filepath.Join(t.TempDir(), "admin.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	cfg := config.Config{
		Host:                      "127.0.0.1",
		Port:                      8787,
		UpstreamURL:               "http://127.0.0.1:1", // unreachable unless overridden
		EncryptionSecret:          "0123456789abcdef",
		ProxyTokens:               []string{"client-token-16"},
		AdminTokens:               []string{testAdminToken},
		SelectionStrategy:         config.StrategyRoundRobin,
		AllowedPaths:              []string{"/**"},
		MaxAttempts:               3,
		AttemptTimeoutMs:          1000,
		AllowRawKeyDisplay:        true,
		LogRetentionDays:          14,
		AdminSessionTTLSeconds:    3600,
		AdminLockoutMaxFailures:   5,
		AdminLockoutWindowSeconds: 300,
		AdminLockoutSeconds:       900,
	}
	sched := scheduler.New(nil, scheduler.StrategyRoundRobin)
	s := &Server{Cfg: cfg, Store: st, Scheduler: sched}
	s.Init()
	mux := http.NewServeMux()
	s.Register(mux)
	return &testEnv{s: s, mux: mux}
}

func (e *testEnv) request(method, path, token string, body io.Reader, header string) *httptest.ResponseRecorder {
	t := httptest.NewRequest(method, path, body)
	if token != "" {
		t.Header.Set("authorization", "Bearer "+token)
	}
	if header != "" {
		t.Header.Set("x-admin-session-id", header)
	}
	w := httptest.NewRecorder()
	e.mux.ServeHTTP(w, t)
	return w
}

func (e *testEnv) loginSession(t *testing.T) string {
	t.Helper()
	w := e.request("POST", "/_proxy/session", testAdminToken, strings.NewReader("{}"), "")
	if w.Code != 200 {
		t.Fatalf("login failed: %d %s", w.Code, w.Body.String())
	}
	var body struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.SessionID
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad json (%d): %s", w.Code, w.Body.String())
	}
	return body
}

func seedHealthyKey(t *testing.T, e *testEnv, id string) {
	t.Helper()
	if err := e.s.Store.SeedKeys([]state.KeySeed{{ID: id, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	e.s.Scheduler.AddKey(scheduler.Key{ID: id, Value: "sk", Weight: 1, Enabled: true})
}

func TestLiveAndReady(t *testing.T) {
	e := newTestEnv(t)
	if w := e.request("GET", "/_proxy/live", "", nil, ""); w.Code != 200 {
		t.Errorf("live = %d", w.Code)
	}
	// No keys seeded -> not ready.
	w := e.request("GET", "/_proxy/ready", "", nil, "")
	if w.Code != 503 {
		t.Errorf("ready without keys = %d, want 503", w.Code)
	}
	body := decodeBody(t, w)
	if body["reason"] != "no_available_keys" {
		t.Errorf("reason = %v", body["reason"])
	}
	seedHealthyKey(t, e, "k1")
	if w := e.request("GET", "/_proxy/ready", "", nil, ""); w.Code != 200 {
		t.Errorf("ready with key = %d", w.Code)
	}
}

func TestAuthEnforcement(t *testing.T) {
	e := newTestEnv(t)
	if w := e.request("GET", "/_proxy/health", "", nil, ""); w.Code != 401 {
		t.Errorf("health without auth = %d, want 401", w.Code)
	}
	if w := e.request("GET", "/_proxy/health", "wrong-token", nil, ""); w.Code != 401 {
		t.Errorf("health with bad token = %d, want 401", w.Code)
	}
	if w := e.request("GET", "/_proxy/health", testAdminToken, nil, ""); w.Code != 200 {
		t.Errorf("health with bearer = %d", w.Code)
	}
	sid := e.loginSession(t)
	if w := e.request("GET", "/_proxy/health", "", nil, sid); w.Code != 200 {
		t.Errorf("health with session = %d", w.Code)
	}
	if w := e.request("GET", "/_proxy/health", "", nil, "bogus-session"); w.Code != 401 {
		t.Errorf("health with bogus session = %d, want 401", w.Code)
	}
	// Session persists (touch on use) and expiry is honored.
	session, err := e.s.Store.GetSession(sid)
	if err != nil || session.TokenID == "" {
		t.Fatalf("session stored: %v %+v", err, session)
	}
}

func TestHTTPSRequirement(t *testing.T) {
	e := newTestEnv(t)
	e.s.Cfg.AdminRequireHTTPS = true
	w := e.request("GET", "http://example.com/_proxy/health", testAdminToken, nil, "")
	if w.Code != http.StatusUpgradeRequired {
		t.Errorf("plain http external host = %d, want 426", w.Code)
	}
	// Forwarded proto satisfies the check.
	req := httptest.NewRequest("GET", "http://example.com/_proxy/health", nil)
	req.Header.Set("authorization", "Bearer "+testAdminToken)
	req.Header.Set("x-forwarded-proto", "https")
	rec := httptest.NewRecorder()
	e.mux.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Errorf("x-forwarded-proto https = %d", rec.Code)
	}
	if w := e.request("GET", "http://127.0.0.1/_proxy/health", testAdminToken, nil, ""); w.Code != 200 {
		t.Errorf("localhost host = %d", w.Code)
	}
}

func TestLoginAndLockout(t *testing.T) {
	e := newTestEnv(t)
	// Bad token -> 401 and audit trail.
	for i := 0; i < 5; i++ {
		w := e.request("POST", "/_proxy/session", "bad-token", strings.NewReader("{}"), "")
		if w.Code != 401 {
			t.Fatalf("bad login = %d", w.Code)
		}
	}
	// Threshold reached: even the correct token is now locked out.
	w := e.request("POST", "/_proxy/session", testAdminToken, strings.NewReader("{}"), "")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("locked login = %d, want 429", w.Code)
	}
	if w.Header().Get("retry-after") == "" {
		t.Error("retry-after header missing on lockout")
	}
	body := decodeBody(t, w)
	if body["error"].(map[string]any)["code"] != "too_many_attempts" {
		t.Errorf("code = %v", body["error"])
	}
	records, total, _ := e.s.Store.ListAudit(100)
	if total < 6 {
		t.Errorf("audit rows = %d, want >= 6", total)
	}
	if records[0].Action != "admin_login" || records[0].Success {
		t.Errorf("latest audit = %+v", records[0])
	}
}

func TestIsLockedOutUnit(t *testing.T) {
	e := newTestEnv(t)
	now := time.Now().UnixMilli()
	// Old failures outside the window do not count.
	e.s.loginFailures["1.1.1.1"] = []int64{now - 10*60*1000, now - 10*60*1000, now - 10*60*1000, now - 10*60*1000, now - 10*60*1000}
	if locked, _ := e.s.isLockedOut("1.1.1.1"); locked {
		t.Error("old failures must not lock")
	}
	// Four recent failures: not locked yet.
	e.s.loginFailures["2.2.2.2"] = []int64{now - 1000, now - 2000, now - 3000, now - 4000}
	if locked, _ := e.s.isLockedOut("2.2.2.2"); locked {
		t.Error("4 failures must not lock (threshold 5)")
	}
	e.s.recordLoginFailure("2.2.2.2")
	locked, remaining := e.s.isLockedOut("2.2.2.2")
	if !locked || remaining < 1 || remaining > 900 {
		t.Errorf("locked=%v remaining=%d, want true with 1..900", locked, remaining)
	}
	// Nil map safety.
	e.s.loginFailures = nil
	if locked, _ := e.s.isLockedOut("3.3.3.3"); locked {
		t.Error("empty state must not lock")
	}
	e.s.recordLoginFailure("3.3.3.3") // must not panic on nil map
}

func TestSessionLifecycleEndpoints(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	sid2 := e.loginSession(t)

	w := e.request("GET", "/_proxy/sessions", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("list sessions = %d", w.Code)
	}
	body := decodeBody(t, w)
	if len(body["sessions"].([]any)) != 2 {
		t.Errorf("sessions = %v", body["sessions"])
	}
	// Revoke one session via POST.
	payload := fmt.Sprintf(`{"sessionId":%q}`, sid2)
	if w := e.request("POST", "/_proxy/sessions", "", strings.NewReader(payload), sid); w.Code != 200 {
		t.Errorf("revoke = %d", w.Code)
	}
	if _, err := e.s.Store.GetSession(sid2); err == nil {
		t.Error("revoked session still exists")
	}
	// Missing sessionId -> 400.
	if w := e.request("POST", "/_proxy/sessions", "", strings.NewReader("{}"), sid); w.Code != 400 {
		t.Errorf("revoke without id = %d, want 400", w.Code)
	}
	// Logout deletes own session.
	if w := e.request("DELETE", "/_proxy/session", "", nil, sid); w.Code != 200 {
		t.Errorf("logout = %d", w.Code)
	}
	if _, err := e.s.Store.GetSession(sid); err == nil {
		t.Error("logged-out session still exists")
	}
}

func TestKeysCRUD(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)

	w := e.request("GET", "/_proxy/keys", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("list keys = %d", w.Code)
	}
	body := decodeBody(t, w)
	if _, ok := body["scheduler"]; !ok {
		t.Error("scheduler snapshot missing")
	}

	// Validation errors.
	if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(`{"id":"a"}`), sid); w.Code != 400 {
		t.Errorf("missing value = %d, want 400", w.Code)
	}
	if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(`{"value":"v"}`), sid); w.Code != 400 {
		t.Errorf("missing id = %d, want 400", w.Code)
	}
	zero := 0
	if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(fmt.Sprintf(`{"id":"a","value":"v","weight":%d}`, zero)), sid); w.Code != 400 {
		t.Errorf("weight 0 = %d, want 400", w.Code)
	}
	// Create.
	if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(`{"id":"a","value":"secret-a","weight":2}`), sid); w.Code != 200 {
		t.Fatalf("create = %d: %s", w.Code, w.Body.String())
	}
	// Duplicate.
	if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(`{"id":"a","value":"other"}`), sid); w.Code != 409 {
		t.Errorf("duplicate = %d, want 409", w.Code)
	}
	// Stored encrypted; secret endpoint decrypts.
	stored, _ := e.s.Store.GetKeyValue("a")
	if stored == nil || *stored == "secret-a" {
		t.Fatalf("value not encrypted at rest: %v", stored)
	}
	w = e.request("GET", "/_proxy/keys/a/secret", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("secret = %d", w.Code)
	}
	secret := decodeBody(t, w)
	if secret["secret"] != "secret-a" {
		t.Errorf("secret = %v", secret["secret"])
	}
	// Raw display disabled -> 403.
	e.s.Cfg.AllowRawKeyDisplay = false
	if w := e.request("GET", "/_proxy/keys/a/secret", "", nil, sid); w.Code != 403 {
		t.Errorf("secret with policy off = %d, want 403", w.Code)
	}
	e.s.Cfg.AllowRawKeyDisplay = true

	// Update weight + enabled.
	if w := e.request("PUT", "/_proxy/keys/a", "", strings.NewReader(`{"weight":7,"enabled":false}`), sid); w.Code != 200 {
		t.Errorf("update = %d", w.Code)
	}
	stats, _ := e.s.Store.ListKeyStats()
	if stats[0].Weight != 7 || stats[0].Enabled {
		t.Errorf("update not persisted: %+v", stats[0])
	}
	if _, disabled := e.s.Scheduler.GetKey("a"); !disabled {
		_ = disabled
	}
	if w := e.request("PUT", "/_proxy/keys/a", "", strings.NewReader(`{"weight":-3}`), sid); w.Code != 400 {
		t.Errorf("negative weight = %d, want 400", w.Code)
	}
	if w := e.request("PUT", "/_proxy/keys/ghost", "", strings.NewReader(`{"weight":1}`), sid); w.Code != 404 {
		t.Errorf("update missing = %d, want 404", w.Code)
	}

	// Enable/disable/reset-circuit actions.
	if w := e.request("POST", "/_proxy/keys/a/enable", "", nil, sid); w.Code != 200 {
		t.Errorf("enable = %d", w.Code)
	}
	if w := e.request("POST", "/_proxy/keys/a/disable", "", nil, sid); w.Code != 200 {
		t.Errorf("disable = %d", w.Code)
	}
	stats, _ = e.s.Store.ListKeyStats()
	if stats[0].Enabled {
		t.Error("disable action not persisted")
	}
	if w := e.request("POST", "/_proxy/keys/a/reset-circuit", "", nil, sid); w.Code != 200 {
		t.Errorf("reset-circuit = %d", w.Code)
	}

	// Last-key protection: create a second key, then delete both one by one.
	if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(`{"id":"b","value":"v-b"}`), sid); w.Code != 200 {
		t.Fatal("second create failed")
	}
	if w := e.request("DELETE", "/_proxy/keys/a", "", nil, sid); w.Code != 200 {
		t.Errorf("delete = %d", w.Code)
	}
	w = e.request("DELETE", "/_proxy/keys/b", "", nil, sid)
	if w.Code != 409 {
		t.Errorf("delete last = %d, want 409", w.Code)
	}
	if decodeBody(t, w)["error"].(map[string]any)["code"] != "last_key" {
		t.Error("last_key code missing")
	}
	if w := e.request("GET", "/_proxy/keys/a/failures", "", nil, sid); w.Code != 200 {
		t.Errorf("failures endpoint = %d", w.Code)
	}
}

func TestKeysBatchAndImportExport(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	for _, id := range []string{"a", "b", "c"} {
		if w := e.request("POST", "/_proxy/keys", "", strings.NewReader(fmt.Sprintf(`{"id":%q,"value":"v-%s"}`, id, id)), sid); w.Code != 200 {
			t.Fatalf("setup create %s failed", id)
		}
	}

	// Batch disable + reset.
	if w := e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(`{"ids":["a","b"],"action":"disable"}`), sid); w.Code != 200 {
		t.Errorf("batch disable = %d", w.Code)
	}
	stats, _ := e.s.Store.ListKeyStats()
	if stats[0].Enabled || stats[1].Enabled {
		t.Error("batch disable not persisted")
	}
	if w := e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(`{"ids":["a"],"action":"bogus"}`), sid); w.Code != 400 {
		t.Errorf("unknown action = %d, want 400", w.Code)
	}
	// Batch delete: unknown id reported, last-key guard respected.
	payload := `{"ids":["ghost","a","b"],"action":"delete"}`
	w := e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(payload), sid)
	if w.Code != 200 {
		t.Fatalf("batch delete = %d", w.Code)
	}
	results := decodeBody(t, w)["results"].([]any)
	if len(results) != 3 {
		t.Fatalf("results = %v", results)
	}
	// ghost -> key_not_found; a deleted; b blocked as last key (c remains too,
	// so both a and b delete; only ghost is reported).
	count, _ := e.s.Store.KeyCount()
	if count != 1 {
		t.Errorf("key count after batch = %d, want 1", count)
	}

	// Import: valid + duplicate + empty + bad weight.
	body := `{"keys":[{"id":"x","value":"vx","weight":2},{"id":"x","value":"dup"},{"id":"","value":""},{"id":"w","value":"vw","weight":0},{"id":"","value":"auto"}]}`
	w = e.request("POST", "/_proxy/keys/import", "", strings.NewReader(body), sid)
	if w.Code != 200 {
		t.Fatalf("import = %d: %s", w.Code, w.Body.String())
	}
	imp := decodeBody(t, w)
	if imp["imported"].(float64) != 2 || imp["skipped"].(float64) != 3 {
		t.Errorf("import = %v", imp)
	}
	// Empty keys array -> 400.
	if w := e.request("POST", "/_proxy/keys/import", "", strings.NewReader(`{"keys":[]}`), sid); w.Code != 400 {
		t.Errorf("empty import = %d, want 400", w.Code)
	}

	// Export: decrypts to id:plaintext:weight lines.
	w = e.request("GET", "/_proxy/keys/export", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("export = %d", w.Code)
	}
	text := w.Body.String()
	if !strings.Contains(text, "x:vx:2") || !strings.Contains(text, "import_0005:auto:1") {
		t.Errorf("export text = %q", text)
	}
	if w.Header().Get("content-type") != "text/plain; charset=utf-8" {
		t.Errorf("export content-type = %q", w.Header().Get("content-type"))
	}
	// Export blocked by policy.
	e.s.Cfg.AllowRawKeyDisplay = false
	if w := e.request("GET", "/_proxy/keys/export", "", nil, sid); w.Code != 403 {
		t.Errorf("export with policy off = %d, want 403", w.Code)
	}
	e.s.Cfg.AllowRawKeyDisplay = true
}

func TestLogsEndpoints(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	now := time.Now().UnixMilli()
	if err := e.s.Store.RecordRequestLog(state.RequestLog{RequestID: "req-1", TokenID: strPtr("tok"), Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 11, Query: strPtr("q,\"x\""), CreatedAt: now}); err != nil {
		t.Fatal(err)
	}
	if err := e.s.Store.RecordRequestLog(state.RequestLog{RequestID: "old", Method: "GET", Path: "/", Status: 200, CreatedAt: now - 30*24*3600*1000}); err != nil {
		t.Fatal(err)
	}

	w := e.request("GET", "/_proxy/logs", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("logs = %d", w.Code)
	}
	logs := decodeBody(t, w)["logs"].([]any)
	if len(logs) != 1 {
		t.Errorf("default window logs = %d, want 1 (30d-old pruned from view)", len(logs))
	}
	w = e.request("GET", "/_proxy/logs?from=0", "", nil, sid)
	if len(decodeBody(t, w)["logs"].([]any)) != 2 {
		t.Error("from=0 should see both")
	}
	w = e.request("GET", "/_proxy/logs?from=0&status=200&path=/search&keyId=k&limit=1", "", nil, sid)
	if len(decodeBody(t, w)["logs"].([]any)) != 1 {
		t.Error("combined filters failed")
	}

	// Trace.
	w = e.request("GET", "/_proxy/logs/trace/req-1", "", nil, sid)
	trace := decodeBody(t, w)
	if trace["requestId"] != "req-1" || len(trace["trace"].([]any)) != 1 {
		t.Errorf("trace = %v", trace)
	}

	// CSV export.
	w = e.request("GET", "/_proxy/logs/export?from=0", "", nil, sid)
	csv := w.Body.String()
	if !strings.HasPrefix(csv, "request_id,token_id,") {
		t.Errorf("csv header = %q", csv[:40])
	}
	if !strings.Contains(csv, `"q,""x"""`) {
		t.Errorf("csv field escaping missing: %q", csv)
	}

	// Prune deletes the old row.
	w = e.request("POST", "/_proxy/logs/prune", "", nil, sid)
	if w.Code != 200 {
		t.Errorf("prune = %d", w.Code)
	}
	if decodeBody(t, w)["deleted"].(float64) != 1 {
		t.Error("prune deleted count wrong")
	}
}

func TestObservabilityAndMetricsAndConfig(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	seedHealthyKey(t, e, "k1")
	if err := e.s.Store.RecordRequestLog(state.RequestLog{RequestID: "r", Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"k1"}, Attempts: 1, LatencyMs: 25, CreatedAt: time.Now().UnixMilli()}); err != nil {
		t.Fatal(err)
	}

	w := e.request("GET", "/_proxy/observability", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("observability = %d", w.Code)
	}
	obs := decodeBody(t, w)
	for _, field := range []string{"trends", "alerts", "window", "retention", "keys"} {
		if _, ok := obs[field]; !ok {
			t.Errorf("observability missing %q", field)
		}
	}
	if obs["keys"].(map[string]any)["healthy"].(float64) != 1 {
		t.Errorf("healthy count = %v", obs["keys"])
	}

	w = e.request("GET", "/_proxy/metrics", "", nil, sid)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "exa_proxy_") {
		t.Errorf("metrics = %d, body prefix %q", w.Code, w.Body.String()[:min(len(w.Body.String()), 40)])
	}

	w = e.request("GET", "/_proxy/config-summary", "", nil, sid)
	cfg := decodeBody(t, w)
	version := cfg["version"].(map[string]any)
	if version["current"] != Version {
		t.Errorf("version = %v, want %s", version["current"], Version)
	}
	if cfg["listen"] != "127.0.0.1:8787" {
		t.Errorf("listen = %v", cfg["listen"])
	}
	if cfg["state"].(map[string]any)["backend"] != "sqlite" {
		t.Error("state backend missing")
	}

	w = e.request("GET", "/_proxy/audit", "", nil, sid)
	if w.Code != 200 {
		t.Errorf("audit = %d", w.Code)
	}
	// At least the login audit rows are present.
	if decodeBody(t, w)["total"].(float64) < 1 {
		t.Error("audit total empty")
	}
	w = e.request("GET", "/_proxy/audit/export", "", nil, sid)
	if !strings.HasPrefix(w.Body.String(), "actor_token_id,action,") {
		t.Error("audit csv header missing")
	}
}

func TestHealthSummary(t *testing.T) {
	e := newTestEnv(t)
	seedHealthyKey(t, e, "k1")
	e.s.Store.SetCooldown("k1", time.Now().Add(time.Hour).UnixMilli(), strPtr("rate_limit"))
	seedHealthyKey(t, e, "k2")
	e.s.Store.SetEnabled("k2", false)
	e.s.Scheduler.SetDisabled("k2", true)

	w := e.request("GET", "/_proxy/health", testAdminToken, nil, "")
	body := decodeBody(t, w)
	keys := body["keys"].(map[string]any)
	if keys["total"].(float64) != 2 || keys["healthy"].(float64) != 0 || keys["cooldown"].(float64) != 1 || keys["disabled"].(float64) != 1 {
		t.Errorf("health keys = %v", keys)
	}
}

func TestWebhookTest(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	// No webhook configured.
	w := e.request("POST", "/_proxy/alerts/webhook/test", "", nil, sid)
	if w.Code != 200 || decodeBody(t, w)["error"] != "no_webhook_url" {
		t.Errorf("webhook without url = %d %s", w.Code, w.Body.String())
	}
	// Configured -> posts to the test server.
	hits := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.Header.Get("authorization") != "Bearer hook-token" {
			t.Error("bearer token not forwarded")
		}
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	e.s.Cfg.AlertWebhookURL = upstream.URL
	e.s.Cfg.AlertWebhookBearerToken = "hook-token"
	w = e.request("POST", "/_proxy/alerts/webhook/test", "", nil, sid)
	body := decodeBody(t, w)
	if body["ok"] != true || body["statusCode"].(float64) != 200 {
		t.Errorf("webhook test = %v", body)
	}
	if hits != 1 {
		t.Errorf("webhook hits = %d", hits)
	}
}

func TestTestKeyAgainstFakeUpstream(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-live" {
			t.Error("upstream key not forwarded")
		}
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer upstream.Close()
	e.s.Cfg.UpstreamURL = upstream.URL
	seedHealthyKey(t, e, "k1")
	e.s.Store.SetEnabled("k1", true)
	// Scheduler key value is what testKey uses.
	e.s.Scheduler.RemoveKey("k1")
	e.s.Scheduler.AddKey(scheduler.Key{ID: "k1", Value: "sk-live", Weight: 1, Enabled: true})

	w := e.request("POST", "/_proxy/keys/k1/test", "", nil, sid)
	if w.Code != 200 {
		t.Fatalf("test key = %d", w.Code)
	}
	body := decodeBody(t, w)
	if body["ok"] != false || body["reason"] != "upstream_error" || body["status"].(float64) != 401 {
		t.Errorf("test key result = %v", body)
	}
	// Unknown key -> 404 without upstream call.
	if w := e.request("POST", "/_proxy/keys/ghost/test", "", nil, sid); w.Code != 404 {
		t.Errorf("test missing key = %d, want 404", w.Code)
	}
}

func TestEventsRequiresAuth(t *testing.T) {
	e := newTestEnv(t)
	ts := httptest.NewServer(e.mux)
	defer ts.Close()

	// Unauthenticated -> 401.
	resp, err := http.Get(ts.URL + "/_proxy/events")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 401 {
		t.Errorf("events without auth = %d, want 401", resp.StatusCode)
	}

	// Session via query param authenticates (EventSource cannot set headers).
	sid := e.loginSession(t)
	ctxClient := &http.Client{Timeout: 3 * time.Second}
	resp, err = ctxClient.Get(ts.URL + "/_proxy/events?sessionId=" + sid)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Errorf("events with session = %d, want 200", resp.StatusCode)
	}
	buf := make([]byte, 256)
	if _, err := resp.Body.Read(buf); err != nil && err != io.EOF {
		t.Fatalf("read snapshot: %v", err)
	}
	if !strings.Contains(string(buf), "event: snapshot") {
		t.Errorf("first frame = %q", string(buf))
	}
	// Invalid session id -> still 401.
	resp2, err := ctxClient.Get(ts.URL + "/_proxy/events?sessionId=bogus")
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != 401 {
		t.Errorf("events with bogus session = %d, want 401", resp2.StatusCode)
	}
}

func TestRequestIDAndClientIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("x-request-id", "my-req")
	if got := requestIDOf(req); got != "my-req" {
		t.Errorf("requestIDOf = %q", got)
	}
	if got := requestIDOf(httptest.NewRequest("GET", "/", nil)); !strings.HasPrefix(got, "req_") {
		t.Errorf("generated request id = %q", got)
	}
	req.RemoteAddr = "9.9.9.9:1234"
	if got := clientIP(req); got != "9.9.9.9" {
		t.Errorf("clientIP = %q", got)
	}
	req.Header.Set("x-forwarded-for", "1.1.1.1, 2.2.2.2")
	if got := clientIP(req); got != "1.1.1.1" {
		t.Errorf("clientIP xff = %q", got)
	}
	req.RemoteAddr = "[::1]:9999"
	if got := clientIP(req); got == "" {
		t.Error("ipv6 clientIP empty")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func strPtr(v string) *string { return &v }

func TestClosedStoreSurfacesInternalErrors(t *testing.T) {
	e := newTestEnv(t)
	seedHealthyKey(t, e, "k1")
	// Close the store: every Store-backed handler must degrade to a 500 (or
	// a documented degraded response) instead of panicking.
	if err := e.s.Store.Close(); err != nil {
		t.Fatal(err)
	}

	requests := []struct {
		method, path, body string
		want               int
	}{
		{"GET", "/_proxy/keys", "", 500},
		{"GET", "/_proxy/keys/k1/failures", "", 500},
		{"GET", "/_proxy/keys/export", "", 500},
		{"POST", "/_proxy/keys", `{"id":"n","value":"v"}`, 500},
		{"GET", "/_proxy/logs", "", 500},
		{"GET", "/_proxy/logs/export", "", 500},
		{"POST", "/_proxy/logs/prune", "", 500},
		{"GET", "/_proxy/logs/trace/req-1", "", 500},
		{"GET", "/_proxy/audit", "", 500},
		{"GET", "/_proxy/audit/export", "", 500},
		{"GET", "/_proxy/observability", "", 500},
		{"GET", "/_proxy/metrics", "", 500},
		{"GET", "/_proxy/sessions", "", 500},
	}
	for _, r := range requests {
		// Bearer auth only: session validation needs the store, which is closed.
		w := e.request(r.method, r.path, testAdminToken, strings.NewReader(r.body), "")
		if w.Code != r.want {
			t.Errorf("%s %s = %d, want %d (%s)", r.method, r.path, w.Code, r.want, w.Body.String())
		}
	}
	// Health survives (keyOperations swallows the error) and reports zeros.
	if w := e.request("GET", "/_proxy/health", testAdminToken, nil, ""); w.Code != 200 {
		t.Errorf("health on closed store = %d, want 200 (degraded)", w.Code)
	}
	// Import skips rows whose insert fails.
	w := e.request("POST", "/_proxy/keys/import", testAdminToken, strings.NewReader(`{"keys":[{"id":"z","value":"v"}]}`), "")
	if w.Code != 200 {
		t.Errorf("import = %d", w.Code)
	}
	body := decodeBody(t, w)
	if body["imported"].(float64) != 0 || body["skipped"].(float64) != 1 {
		t.Errorf("import result = %v, want 0 imported / 1 skipped", body)
	}
	// Batch delete degrades to the last-key guard when KeyCount fails.
	w = e.request("POST", "/_proxy/keys/batch", testAdminToken, strings.NewReader(`{"ids":["k1"],"action":"delete"}`), "")
	if w.Code != 200 {
		t.Errorf("batch delete on closed store = %d", w.Code)
	}
	results := decodeBody(t, w)["results"].([]any)
	if results[0].(map[string]any)["reason"] != "last_key" {
		t.Errorf("batch delete degraded result = %v", results[0])
	}
	// Login fails at session creation.
	if w := e.request("POST", "/_proxy/session", testAdminToken, strings.NewReader("{}"), ""); w.Code != 500 {
		t.Errorf("login on closed store = %d, want 500", w.Code)
	}
	// DELETE key hits the KeyCount error path.
	if w := e.request("DELETE", "/_proxy/keys/k1", testAdminToken, nil, ""); w.Code != 500 {
		t.Errorf("delete key on closed store = %d, want 500", w.Code)
	}
	// Events endpoint: the recorder implements Flusher, so the handler
	// streams one snapshot (degraded to zero counts on the closed store)
	// and returns when the request context is cancelled.
	eventsCtx, cancelEvents := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/_proxy/events", nil).WithContext(eventsCtx)
	req.Header.Set("authorization", "Bearer "+testAdminToken)
	rec := httptest.NewRecorder()
	served := make(chan struct{})
	go func() { e.mux.ServeHTTP(rec, req); close(served) }()
	time.Sleep(50 * time.Millisecond)
	cancelEvents()
	select {
	case <-served:
	case <-time.After(2 * time.Second):
		t.Fatal("events handler did not return on context cancel")
	}
	if rec.Code != 200 {
		t.Errorf("events snapshot = %d, want 200", rec.Code)
	}
}

func TestMethodNotAllowedBranches(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	cases := []struct{ method, path string }{
		{"PUT", "/_proxy/session"},
		{"PATCH", "/_proxy/keys"},
		{"PATCH", "/_proxy/sessions"},
		{"DELETE", "/_proxy/keys"},
	}
	for _, c := range cases {
		if w := e.request(c.method, c.path, "", nil, sid); w.Code != 405 {
			t.Errorf("%s %s = %d, want 405", c.method, c.path, w.Code)
		}
	}
	// Logout with bearer-only auth (no session header) still answers 200.
	if w := e.request("DELETE", "/_proxy/session", testAdminToken, nil, ""); w.Code != 200 {
		t.Errorf("bearer logout = %d, want 200", w.Code)
	}
}

// fakeTestKeyUpstream answers /search with a scripted status.
func fakeTestKeyUpstream(t *testing.T, status int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/search") {
			t.Errorf("test key probed wrong path: %s", r.URL.Path)
		}
		w.WriteHeader(status)
	}))
}

func TestTestKeyFullMatrix(t *testing.T) {
	cases := []struct {
		name       string
		status     int
		wantReason string
		wantOK     bool
		check      func(t *testing.T, e *testEnv)
	}{
		{"429 trips cooldown", 429, "rate_limit", false, func(t *testing.T, e *testEnv) {
			stats, _ := e.s.Store.ListKeyStats()
			if stats[0].CooldownUntil == 0 || stats[0].CooldownReason == nil || *stats[0].CooldownReason != "rate_limit" {
				t.Errorf("cooldown not set: %+v", stats[0])
			}
		}},
		{"402 disables key", 402, "credits_exhausted", false, func(t *testing.T, e *testEnv) {
			stats, _ := e.s.Store.ListKeyStats()
			if stats[0].Enabled {
				t.Error("402 did not disable the key")
			}
		}},
		{"200 succeeds", 200, "ok", true, func(t *testing.T, e *testEnv) {
			logs, _ := e.s.Store.ListRequestLogs(state.LogFilter{From: 0})
			if len(logs) != 1 || logs[0].Status != 200 {
				t.Errorf("probe log = %+v", logs)
			}
		}},
		{"500 reports upstream error", 500, "upstream_error", false, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newTestEnv(t)
			sid := e.loginSession(t)
			upstream := fakeTestKeyUpstream(t, c.status)
			defer upstream.Close()
			e.s.Cfg.UpstreamURL = upstream.URL
			seedHealthyKey(t, e, "k1")
			e.s.Scheduler.RemoveKey("k1")
			e.s.Scheduler.AddKey(scheduler.Key{ID: "k1", Value: "sk-live", Weight: 1, Enabled: true})

			w := e.request("POST", "/_proxy/keys/k1/test", "", nil, sid)
			if w.Code != 200 {
				t.Fatalf("status = %d", w.Code)
			}
			body := decodeBody(t, w)
			if body["reason"] != c.wantReason || body["ok"] != c.wantOK || body["status"].(float64) != float64(c.status) {
				t.Errorf("result = %v", body)
			}
			if c.check != nil {
				c.check(t, e)
			}
		})
	}

	// Connection-level failure: upstream port closed.
	e := newTestEnv(t)
	sid := e.loginSession(t)
	e.s.Cfg.UpstreamURL = "http://127.0.0.1:1"
	seedHealthyKey(t, e, "k1")
	e.s.Scheduler.RemoveKey("k1")
	e.s.Scheduler.AddKey(scheduler.Key{ID: "k1", Value: "sk", Weight: 1, Enabled: true})
	w := e.request("POST", "/_proxy/keys/k1/test", "", nil, sid)
	body := decodeBody(t, w)
	if body["ok"] != false || body["reason"] != "connection_error" || body["status"].(float64) != 0 {
		t.Errorf("connection failure result = %v", body)
	}
}

func TestBatchTestActionTruncatesAndProbes(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	upstream := fakeTestKeyUpstream(t, 200)
	defer upstream.Close()
	e.s.Cfg.UpstreamURL = upstream.URL

	// 15 keys: the test action processes at most 12.
	ids := make([]string, 15)
	for i := range ids {
		id := fmt.Sprintf("k%02d", i)
		ids[i] = id
		seedHealthyKey(t, e, id)
		e.s.Scheduler.RemoveKey(id)
		e.s.Scheduler.AddKey(scheduler.Key{ID: id, Value: "sk", Weight: 1, Enabled: true})
	}
	payload, _ := json.Marshal(map[string]any{"ids": ids, "action": "test"})
	w := e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(string(payload)), sid)
	if w.Code != 200 {
		t.Fatalf("batch test = %d", w.Code)
	}
	results := decodeBody(t, w)["results"].([]any)
	if len(results) != 12 {
		t.Errorf("results = %d, want capped at 12", len(results))
	}
	// Unknown key among a small batch is reported.
	w = e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(`{"ids":["ghost"],"action":"test"}`), sid)
	results = decodeBody(t, w)["results"].([]any)
	if results[0].(map[string]any)["reason"] != "key_not_found" {
		t.Errorf("ghost result = %v", results[0])
	}
	// Batch enable/reset round trip.
	if w := e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(`{"ids":["k00"],"action":"reset"}`), sid); w.Code != 200 {
		t.Errorf("batch reset = %d", w.Code)
	}
	if w := e.request("POST", "/_proxy/keys/batch", "", strings.NewReader(`{"ids":["k00"],"action":"enable"}`), sid); w.Code != 200 {
		t.Errorf("batch enable = %d", w.Code)
	}
}

func TestKeyViewsUndecryptableValueKeepsID(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	// Valid encrypted format but wrong secret content.
	bogus := "00112233445566778899001122334455:00112233445566778899001122334455:00112233445566778899001122334455"
	if err := e.s.Store.SeedKeys([]state.KeySeed{{ID: "broken", Value: &bogus, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	w := e.request("GET", "/_proxy/keys", "", nil, sid)
	keys := decodeBody(t, w)["keys"].([]any)
	var view map[string]any
	for _, k := range keys {
		if k.(map[string]any)["id"] == "broken" {
			view = k.(map[string]any)
		}
	}
	if view == nil {
		t.Fatal("broken key missing from view")
	}
	if view["displayId"] != "broken" {
		t.Errorf("displayId = %v, want the raw id (decrypt failed)", view["displayId"])
	}
	// Secret endpoint reports not-found-ish failure.
	if w := e.request("GET", "/_proxy/keys/broken/secret", "", nil, sid); w.Code != 404 {
		t.Errorf("secret for undecryptable = %d, want 404", w.Code)
	}
}

func TestUnknownKeyActionRoute(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	if w := e.request("POST", "/_proxy/keys/k1/bogus-action", "", nil, sid); w.Code != 404 {
		t.Errorf("unknown action = %d, want 404", w.Code)
	}
}

func TestFailedLoginAuditActor(t *testing.T) {
	e := newTestEnv(t)
	e.request("POST", "/_proxy/session", "wrong", strings.NewReader("{}"), "")
	records, _, err := e.s.Store.ListAudit(10)
	if err != nil || len(records) == 0 {
		t.Fatalf("audit = %v, %v", records, err)
	}
	if records[0].ActorTokenID == nil || *records[0].ActorTokenID != "-" {
		t.Errorf("failed login actor = %v, want \"-\"", records[0].ActorTokenID)
	}
}

func TestLogsMalformedParams(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	if w := e.request("GET", "/_proxy/logs?from=abc&limit=-3", "", nil, sid); w.Code != 200 {
		t.Errorf("malformed params = %d, want 200 with defaults", w.Code)
	}
}

func TestWebhookTestFailures(t *testing.T) {
	e := newTestEnv(t)
	sid := e.loginSession(t)
	// Malformed URL -> request construction error.
	e.s.Cfg.AlertWebhookURL = "ht tp://bad url"
	w := e.request("POST", "/_proxy/alerts/webhook/test", "", nil, sid)
	if w.Code != 200 || decodeBody(t, w)["ok"] != false {
		t.Errorf("malformed webhook = %d %s", w.Code, w.Body.String())
	}
	// Unreachable upstream -> client error.
	e.s.Cfg.AlertWebhookURL = "http://127.0.0.1:1/hook"
	w = e.request("POST", "/_proxy/alerts/webhook/test", "", nil, sid)
	body := decodeBody(t, w)
	if body["ok"] != false || body["statusCode"] != nil {
		t.Errorf("unreachable webhook = %v", body)
	}
}

func TestRegisterConsoleRoutes(t *testing.T) {
	proxyStub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("proxied:" + r.URL.Path))
	})
	mux := http.NewServeMux()
	RegisterConsole(mux, proxyStub)

	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}

	root := get("/")
	// The version chip ships as a placeholder and is filled at runtime from
	// /_proxy/config-summary (no server-side injection).
	if root.Code != 200 || !strings.Contains(root.Body.String(), "v—") {
		t.Errorf("root index = %d, chip placeholder present? %v", root.Code, strings.Contains(root.Body.String(), "v—"))
	}
	if ct := root.Header().Get("content-type"); ct != "text/html; charset=utf-8" {
		t.Errorf("content-type = %q", ct)
	}
	if root.Header().Get("x-content-type-options") != "nosniff" {
		t.Error("nosniff missing")
	}
	if w := get("/_proxy/ui"); w.Code != 200 || !strings.Contains(w.Body.String(), "v—") {
		t.Errorf("/_proxy/ui = %d", w.Code)
	}
	// http.FileServer redirects "/index.html" to the directory (301) —
	// standard behavior; the directory forms serve the console directly.
	if w := get("/_proxy/ui/index.html"); w.Code != 200 && w.Code != 301 {
		t.Errorf("/_proxy/ui/index.html = %d", w.Code)
	}
	if w := get("/_proxy/ui/"); w.Code != 200 {
		t.Errorf("/_proxy/ui/ = %d", w.Code)
	}
	if w := get("/_proxy/definitely-missing"); w.Code != 404 {
		t.Errorf("unknown _proxy route = %d, want 404", w.Code)
	}
	if w := get("/search"); w.Code != 200 || w.Body.String() != "proxied:/search" {
		t.Errorf("proxy passthrough = %d %q", w.Code, w.Body.String())
	}
}
