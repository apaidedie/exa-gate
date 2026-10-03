package adminapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/apaidedie/exa-gate/internal/scheduler"
	"github.com/apaidedie/exa-gate/internal/state"
)

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
