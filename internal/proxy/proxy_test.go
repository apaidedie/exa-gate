package proxy

import (
	"encoding/json"
	"strings"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/apaidedie/exa-gate/internal/state"
)

// fakeUpstream is a scriptable upstream recording every request.
type fakeUpstream struct {
	mu       sync.Mutex
	requests []struct {
		path    string
		method  string
		apiKey  string
		body    string
	}
	responses []func(r *http.Request) (int, map[string]string, string)
}

func (f *fakeUpstream) Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error) {
	f.mu.Lock()
	index := len(f.requests)
	f.requests = append(f.requests, struct {
		path   string
		method string
		apiKey string
		body   string
	}{pathAndQuery, method, headers["x-api-key"], string(body)})
	responder := f.responses[index]
	f.mu.Unlock()

	status, header, responseBody := responder(nil)
	recorder := httptest.NewRecorder()
	// Headers must be set BEFORE WriteHeader — the recorder snapshots them.
	for name, value := range header {
		recorder.Header().Set(name, value)
	}
	recorder.WriteHeader(status)
	_, _ = recorder.WriteString(responseBody)
	return recorder.Result(), nil
}

func newTestHandler(t *testing.T, upstream *fakeUpstream, mutate func(*Deps)) (*Handler, *state.Store) {
	t.Helper()
	store, err := state.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	_ = store.SeedKeys([]state.KeySeed{
		{ID: "k1", Weight: 1, Enabled: true},
		{ID: "k2", Weight: 1, Enabled: true},
	})
	handler := &Handler{
		Deps: Deps{
			Upstream:                 upstream,
			State:                    store,
			NextKey:                  func(now int64, exclude map[string]bool) (SchedulerKey, bool) { return SchedulerKey{}, false },
			GetKey:                   func(id string) (SchedulerKey, bool) { return SchedulerKey{ID: id}, id != "" },
			GetByID: func(id string, now int64) (SchedulerKey, bool) {
				value := "value_" + id
				return SchedulerKey{ID: id, Value: value}, true
			},
			RecordFailure:            func(id string, now int64, threshold int, windowMs int64, cooldownMs int64, reason string) (int64, bool) { return 0, false },
			RecordSuccess:            func(id string) {},
			CoolDown:                 func(id string, untilMs int64, reason string) {},
			SetDisabled:              func(id string, disabled bool) {},
			ProxyTokens:              []string{"client_token_16"},
			AllowedPaths:             []string{"/**"},
			MaxAttempts:              2,
			AttemptTimeoutMs:         5000,
			RetryBackoffMs:           []int64{1, 1},
			FailureThreshold:         3,
			FailureWindowSeconds:     60,
			CooldownSeconds:          120,
			RateLimitCooldownSeconds: 300,
			ResourceAffinity:         true,
			SearchCacheTTLSeconds:    0,
		},
	}
	if mutate != nil {
		mutate(&handler.Deps)
	}
	return handler, store
}

func newRequest(t *testing.T, handler http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("authorization", "Bearer "+token)
	if body != "" {
		request.Header.Set("content-type", "application/json")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func TestUnauthorizedRejected(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) { t.Fatal("upstream should not be called"); return 500, nil, "" },
	}}
	handler, _ := newTestHandler(t, upstream, nil)
	recorder := newRequest(t, handler, "POST", "/search", "wrong_token_16!!!!", `{"query":"x"}`)
	if recorder.Code != 401 {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &body)
	if body.Error.Code != "unauthorized" {
		t.Fatalf("error code = %q", body.Error.Code)
	}
}

func TestSuccessPassthroughInjectsUpstreamKey(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(r *http.Request) (int, map[string]string, string) { return 200, map[string]string{"content-type": "application/json"}, `{"results":[{"id":"ok"}]}` },
	}}
	handler, store := newTestHandler(t, upstream, nil)

	// The scheduler wiring for the test uses NextKey from the round-robin shim.
	keys := []SchedulerKey{{ID: "k1", Value: "real_exa_key"}, {ID: "k2", Value: "real_exa_key_2"}}
	used := 0
	handler.Deps.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
		key := keys[used%len(keys)]
		used++
		return key, true
	}
	handler.Deps.GetKey = func(id string) (SchedulerKey, bool) {
		for _, key := range keys {
			if key.ID == id {
				return key, true
			}
		}
		return SchedulerKey{}, false
	}

	recorder := newRequest(t, handler, "POST", "/search", "client_token_16", `{"query":"latest AI news","numResults":3}`)
	if recorder.Code != 200 {
		t.Fatalf("status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "results") {
		t.Fatalf("body not passed through: %s", recorder.Body.String())
	}
	logs, err := store.ListLogsByRequestID("")
	_ = logs
	_ = err
	if len(upstream.requests) != 1 {
		t.Fatalf("upstream calls = %d", len(upstream.requests))
	}
	if upstream.requests[0].apiKey != "real_exa_key" {
		t.Fatalf("x-api-key = %q, want the scheduled upstream key", upstream.requests[0].apiKey)
	}
	if upstream.requests[0].body != `{"query":"latest AI news","numResults":3}` {
		t.Fatalf("body mismatch: %q", upstream.requests[0].body)
	}
}

func TestRateLimitFailsOverToSecondKey(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) { return 429, map[string]string{"retry-after": "30"}, `{"error":"rate_limited"}` },
		func(*http.Request) (int, map[string]string, string) { return 200, map[string]string{"content-type": "application/json"}, `{"ok":true}` },
	}}
	handler, store := newTestHandler(t, upstream, nil)
	keys := []SchedulerKey{{ID: "k1", Value: "key1"}, {ID: "k2", Value: "key2"}}
	sequence := 0
	var cooled []string
	handler.Deps.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
		key := keys[sequence%len(keys)]
		sequence++
		return key, true
	}
	handler.Deps.GetKey = func(id string) (SchedulerKey, bool) {
		for _, key := range keys {
			if key.ID == id {
				return key, true
			}
		}
		return SchedulerKey{}, false
	}
	handler.Deps.CoolDown = func(id string, untilMs int64, reason string) {
		if reason == "rate_limit" {
			cooled = append(cooled, id)
		}
	}
	handler.Deps.RecordFailure = func(id string, now int64, threshold int, windowMs int64, cooldownMs int64, reason string) (int64, bool) {
		return 0, false
	}
	handler.Deps.SetDisabled = func(id string, disabled bool) {}

	recorder := newRequest(t, handler, "POST", "/search", "client_token_16", `{"query":"x"}`)
	if recorder.Code != 200 {
		t.Fatalf("failover status = %d body=%s", recorder.Code, recorder.Body.String())
	}
	if len(cooled) != 1 || cooled[0] != "k1" {
		t.Fatalf("cooldown targets = %v, want [k1]", cooled)
	}
	if len(upstream.requests) != 2 {
		t.Fatalf("attempts = %d, want 2", len(upstream.requests))
	}
	if upstream.requests[0].apiKey != "key1" || upstream.requests[1].apiKey != "key2" {
		t.Fatalf("failover keys = %q then %q", upstream.requests[0].apiKey, upstream.requests[1].apiKey)
	}
	stats, err := store.ListKeyStats()
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]state.KeyStats{}
	for _, stat := range stats {
		byID[stat.ID] = stat
	}
	if byID["k1"].RateLimitCount != 1 {
		t.Fatalf("k1 rate_limit_count = %d", byID["k1"].RateLimitCount)
	}
	if byID["k2"].SuccessCount != 1 {
		t.Fatalf("k2 success_count = %d", byID["k2"].SuccessCount)
	}
}

func TestCacheHitAvoidsUpstream(t *testing.T) {
	calls := 0
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) {
			calls++
			return 200, map[string]string{"content-type": "application/json"}, `{"cached":false}`
		},
		func(*http.Request) (int, map[string]string, string) {
			calls++
			return 200, map[string]string{"content-type": "application/json"}, `{"cached":false}`
		},
	}}
	handler, _ := newTestHandler(t, upstream, func(deps *Deps) {
		deps.SearchCacheTTLSeconds = 60
		deps.ResourceAffinity = false
	})
	keys := []SchedulerKey{{ID: "k1", Value: "key1"}}
	handler.Deps.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
		return keys[0], true
	}
	handler.Deps.GetKey = func(id string) (SchedulerKey, bool) { return keys[0], true }

	first := newRequest(t, handler, "POST", "/search", "client_token_16", `{"query":"same"}`)
	second := newRequest(t, handler, "POST", "/search", "client_token_16", `{"query":"same"}`)
	if first.Code != 200 || second.Code != 200 {
		t.Fatalf("statuses %d/%d", first.Code, second.Code)
	}
	if second.Header().Get("x-cache") != "hit" {
		t.Fatalf("second request not served from cache: %s", second.Header().Get("x-cache"))
	}
	if calls != 1 {
		t.Fatalf("upstream calls = %d, want 1", calls)
	}
}

func TestAffinityPinsResourceToKey(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) { return 200, map[string]string{"content-type": "application/json"}, `{"id":"run_123","status":"running"}` },
		func(*http.Request) (int, map[string]string, string) { return 200, map[string]string{"content-type": "application/json"}, `{"ok":true}` },
	}}
	handler, store := newTestHandler(t, upstream, nil)
	keys := []SchedulerKey{{ID: "k1", Value: "key1"}, {ID: "k2", Value: "key2"}}
	sequence := 0
	handler.Deps.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
		key := keys[sequence%len(keys)]
		sequence++
		return key, true
	}
	handler.Deps.GetKey = func(id string) (SchedulerKey, bool) {
		for _, key := range keys {
			if key.ID == id {
				return key, true
			}
		}
		return SchedulerKey{}, false
	}
	handler.Deps.GetByID = func(id string, now int64) (SchedulerKey, bool) {
		for _, key := range keys {
			if key.ID == id {
				return key, true
			}
		}
		return SchedulerKey{}, false
	}

	// POST /agent/runs creates run_123 on k1.
	if recorder := newRequest(t, handler, "POST", "/agent/runs", "client_token_16", `{"model":"exa"}`); recorder.Code != 200 {
		t.Fatalf("create status = %d", recorder.Code)
	}
	affinity, err := store.GetAffinity("agent_run", "run_123")
	if err != nil || affinity != "k1" {
		t.Fatalf("affinity = %q %v, want k1", affinity, err)
	}
	// GET /agent/runs/run_123 must use the affinity key (k1), not the next
	// rotation key.
	if recorder := newRequest(t, handler, "GET", "/agent/runs/run_123", "client_token_16", ""); recorder.Code != 200 {
		t.Fatalf("get status = %d", recorder.Code)
	}
	if upstream.requests[1].apiKey != "key1" {
		t.Fatalf("affinity request used %q, want key1", upstream.requests[1].apiKey)
	}
}

func TestPathAllowlistBlocks(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){}}
	handler, _ := newTestHandler(t, upstream, func(deps *Deps) {
		deps.AllowedPaths = []string{"/search", "/contents/**"}
	})
	recorder := newRequest(t, handler, "POST", "/admin/deleteEverything", "client_token_16", `{}`)
	if recorder.Code != 403 {
		t.Fatalf("status = %d, want 403", recorder.Code)
	}
}

