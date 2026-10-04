package proxy

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/apaidedie/exa-gate/internal/state"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeUpstream is a scriptable upstream recording every request.
type fakeUpstream struct {
	mu       sync.Mutex
	requests []struct {
		path   string
		method string
		apiKey string
		body   string
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
			Upstream: upstream,
			State:    store,
			NextKey:  func(now int64, exclude map[string]bool) (SchedulerKey, bool) { return SchedulerKey{}, false },
			GetKey:   func(id string) (SchedulerKey, bool) { return SchedulerKey{ID: id}, id != "" },
			GetByID: func(id string, now int64) (SchedulerKey, bool) {
				value := "value_" + id
				return SchedulerKey{ID: id, Value: value}, true
			},
			RecordFailure: func(id string, now int64, threshold int, windowMs int64, cooldownMs int64, reason string) (int64, bool) {
				return 0, false
			},
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
			MaxBodyBytes:             20971520,
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
		func(*http.Request) (int, map[string]string, string) {
			t.Fatal("upstream should not be called")
			return 500, nil, ""
		},
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
		func(r *http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "application/json"}, `{"results":[{"id":"ok"}]}`
		},
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
		func(*http.Request) (int, map[string]string, string) {
			return 429, map[string]string{"retry-after": "30"}, `{"error":"rate_limited"}`
		},
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "application/json"}, `{"ok":true}`
		},
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
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "application/json"}, `{"id":"run_123","status":"running"}`
		},
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "application/json"}, `{"ok":true}`
		},
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

func TestErrorStatusForReason(t *testing.T) {
	status, code, message := errorStatusForReason("timeout")
	if status != 504 || code != "upstream_timeout" || message == "" {
		t.Errorf("timeout mapping = %d %q %q", status, code, message)
	}
	status, code, _ = errorStatusForReason("connection_error")
	if status != 502 || code != "upstream_error" {
		t.Errorf("other mapping = %d %q", status, code)
	}
}

func TestLogErrorCodeForUpstreamStatus(t *testing.T) {
	cases := map[int64]string{
		200: "", // nil expected
		301: "",
		429: "rate_limit",
		402: "credits_exhausted",
		503: "transient_status",
		404: "client_status",
		501: "upstream_error", // 5xx outside the retry table classifies as ok
	}
	for status, want := range cases {
		got := logErrorCodeForUpstreamStatus(status)
		if want == "" {
			if got != nil {
				t.Errorf("status %d errorCode = %v, want nil", status, *got)
			}
			continue
		}
		if got == nil || *got != want {
			t.Errorf("status %d errorCode = %v, want %q", status, got, want)
		}
	}
}

func TestStatusGroupOf(t *testing.T) {
	cases := map[int64]string{200: "2xx", 301: "3xx", 404: "4xx", 500: "5xx", 199: "5xx", 503: "5xx"}
	for status, want := range cases {
		if got := statusGroupOf(status); got != want {
			t.Errorf("statusGroupOf(%d) = %q, want %q", status, got, want)
		}
	}
}

func TestExtractQueryVariants(t *testing.T) {
	if got := extractQuery(nil); got != nil {
		t.Errorf("nil body = %v", got)
	}
	if got := extractQuery([]byte("not json")); got != nil {
		t.Errorf("non-json = %v", got)
	}
	if got := extractQuery([]byte(`{"other":"x"}`)); got != nil {
		t.Errorf("missing query = %v", got)
	}
	if got := extractQuery([]byte(`{"query":""}`)); got != nil {
		t.Errorf("empty query = %v", got)
	}
	if got := extractQuery([]byte(`{"query":"test"}`)); got == nil || *got != "test" {
		t.Errorf("simple query = %v", got)
	}
	long := strings.Repeat("x", 300)
	got := extractQuery([]byte(`{"query":"` + long + `"}`))
	if got == nil || len(*got) != 200 {
		t.Errorf("long query len = %d, want truncated to 200", len(*got))
	}
}

func TestUpstreamTimeoutReturns504(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) { return 0, nil, "" },
	}}
	// Replace the scripted responder with a timeout-classified error.
	upstream.responses[0] = nil
	handler, store := newTestHandler(t, upstream, func(d *Deps) {
		d.MaxAttempts = 1
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
	})
	// Custom upstream that fails with a timeout-classified error.
	handler.Deps.Upstream = timeoutUpstream{}

	request := httptest.NewRequest("POST", "/search", strings.NewReader(`{"query":"x"}`))
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != 504 {
		t.Fatalf("status = %d, want 504: %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "upstream_timeout") {
		t.Errorf("error code missing: %s", recorder.Body.String())
	}
	logs, _ := store.ListRequestLogs(state.LogFilter{From: 0})
	if len(logs) != 1 || logs[0].ErrorCode == nil || *logs[0].ErrorCode != "upstream_timeout" {
		t.Errorf("log = %+v", logs)
	}
}

type timeoutUpstream struct{}

func (timeoutUpstream) Do(string, string, map[string]string, []byte, int64, <-chan struct{}) (*http.Response, error) {
	return nil, errors.New("request phase timeout exceeded")
}

func TestUpstreamConnectionErrorReturns502(t *testing.T) {
	handler, store := newTestHandler(t, &fakeUpstream{}, func(d *Deps) {
		d.MaxAttempts = 1
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
		d.Upstream = errorUpstream{err: errors.New("read: connection reset by peer")}
	})
	request := httptest.NewRequest("GET", "/search", nil)
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != 502 {
		t.Fatalf("status = %d, want 502: %s", recorder.Code, recorder.Body.String())
	}
	logs, _ := store.ListRequestLogs(state.LogFilter{From: 0})
	if len(logs) != 1 || logs[0].ErrorCode == nil || *logs[0].ErrorCode != "upstream_error" {
		t.Errorf("log = %+v", logs)
	}
}

type errorUpstream struct{ err error }

func (e errorUpstream) Do(string, string, map[string]string, []byte, int64, <-chan struct{}) (*http.Response, error) {
	return nil, e.err
}

func TestNoHealthyKeysReturns503(t *testing.T) {
	handler, _ := newTestHandler(t, &fakeUpstream{}, func(d *Deps) {
		d.ResourceAffinity = false
		// NextKey default returns false -> no key at all.
	})
	request := httptest.NewRequest("GET", "/search", nil)
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != 503 {
		t.Fatalf("status = %d, want 503", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "no_healthy_keys") {
		t.Errorf("error code missing: %s", recorder.Body.String())
	}
}

func TestSelectedKeyUnresolvableReturns502(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "text/plain"}, "ok"
		},
	}}
	handler, _ := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
		d.GetKey = func(id string) (SchedulerKey, bool) { return SchedulerKey{}, false }
	})
	request := httptest.NewRequest("GET", "/search", nil)
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != 502 {
		t.Fatalf("status = %d, want 502", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), "key selection could not be resolved") {
		t.Errorf("message missing: %s", recorder.Body.String())
	}
}

func TestTransientRetryRecovers(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) { return 500, nil, "boom" },
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "application/json"}, `{"ok":true}`
		},
	}}
	var failures []string
	handler, store := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.MaxAttempts = 2
		keys := []SchedulerKey{{ID: "k1", Value: "v1"}, {ID: "k2", Value: "v2"}}
		call := 0
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			for _, k := range keys {
				if !exclude[k.ID] {
					return k, true
				}
			}
			return SchedulerKey{}, false
		}
		d.RecordFailure = func(id string, now int64, threshold int, windowMs int64, cooldownMs int64, reason string) (int64, bool) {
			failures = append(failures, id)
			return 0, false
		}
		_ = call
	})
	request := httptest.NewRequest("POST", "/search", strings.NewReader(`{"query":"x"}`))
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != 200 {
		t.Fatalf("status = %d, want 200 after retry: %s", recorder.Code, recorder.Body.String())
	}
	if len(failures) != 1 || failures[0] != "k1" {
		t.Errorf("failures = %v, want one on k1", failures)
	}
	logs, _ := store.ListRequestLogs(state.LogFilter{From: 0})
	if len(logs) != 1 || logs[0].Attempts != 2 || len(logs[0].KeyIDs) != 2 {
		t.Errorf("log = %+v", logs)
	}
}

func TestBodyTooLargeAndReadError(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){}}
	handler, store := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.MaxBodyBytes = 10
	})
	request := httptest.NewRequest("POST", "/search", strings.NewReader(`{"query":"this body is definitely longer than ten bytes"}`))
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != 413 {
		t.Fatalf("status = %d, want 413", recorder.Code)
	}
	logs, _ := store.ListRequestLogs(state.LogFilter{From: 0})
	if len(logs) != 1 || logs[0].ErrorCode == nil || *logs[0].ErrorCode != "body_too_large" {
		t.Errorf("log = %+v", logs)
	}

	// Body read failure -> 400.
	handler2, _ := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
	})
	request2 := httptest.NewRequest("POST", "/search", errReader{})
	request2.Header.Set("authorization", "Bearer client_token_16")
	recorder2 := httptest.NewRecorder()
	handler2.ServeHTTP(recorder2, request2)
	if recorder2.Code != 400 {
		t.Fatalf("status = %d, want 400", recorder2.Code)
	}
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("read failure") }

func TestResponseHeaderFiltering(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{
				"content-type":      "text/plain",
				"connection":        "keep-alive",
				"authorization":     "Bearer leak",
				"x-api-key":         "leak",
				"transfer-encoding": "chunked",
				"x-keep":            "yes",
			}, "body"
		},
	}}
	handler, _ := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
	})
	request := httptest.NewRequest("GET", "/search", nil)
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	for _, banned := range []string{"Connection", "Authorization", "X-Api-Key", "Transfer-Encoding"} {
		if values := recorder.Header().Values(banned); len(values) > 0 {
			t.Errorf("hop-by-hop/sensitive header %s leaked: %v", banned, values)
		}
	}
	if recorder.Header().Get("x-keep") != "yes" {
		t.Error("normal response header dropped")
	}
}

func TestResponseCacheEvictionAndExpiry(t *testing.T) {
	c := &responseCache{entries: map[string]cacheEntry{}}
	for i := 0; i < cacheMaxEntries; i++ {
		c.set(fmt.Sprintf("k%d", i), cacheEntry{body: []byte("v"), contentType: "text/plain"}, 60000)
	}
	if len(c.entries) != cacheMaxEntries {
		t.Fatalf("cache size = %d, want %d", len(c.entries), cacheMaxEntries)
	}
	// One more insert evicts down to the cap.
	c.set("extra", cacheEntry{body: []byte("v")}, 60000)
	if len(c.entries) != cacheMaxEntries {
		t.Errorf("cache size after eviction = %d, want %d", len(c.entries), cacheMaxEntries)
	}
	// Expired entries are dropped on access.
	c.set("expired", cacheEntry{body: []byte("v")}, -1000)
	if _, ok := c.get("expired"); ok {
		t.Error("expired entry was served")
	}
	if _, ok := c.entries["expired"]; ok {
		t.Error("expired entry not deleted on access")
	}
	// Missing key -> miss.
	if _, ok := c.get("missing"); ok {
		t.Error("missing key hit")
	}
	// set overwrites an existing key without growing.
	before := len(c.entries)
	c.set("extra", cacheEntry{body: []byte("v2")}, 60000)
	if len(c.entries) != before {
		t.Error("overwrite changed cache size")
	}
	entry, ok := c.get("extra")
	if !ok || string(entry.body) != "v2" {
		t.Errorf("overwrite failed: %+v", entry)
	}
	if time.Now().UnixMilli() >= entry.expiresAt {
		t.Error("expiresAt not extended on set")
	}
}

func TestWriteProxyErrorShape(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeProxyError(recorder, "some_code", "some message", "req-123", 418)
	if recorder.Code != 418 {
		t.Errorf("status = %d", recorder.Code)
	}
	body := recorder.Body.String()
	for _, want := range []string{`"type":"proxy_error"`, `"code":"some_code"`, `"requestId":"req-123"`} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q: %s", want, body)
		}
	}
}

// errBody is a response body that fails on read.
type errBody struct{}

func (errBody) Read([]byte) (int, error) { return 0, errors.New("body read failure") }
func (errBody) Close() error             { return nil }

func TestSendUpstreamResponseBodyReadFailure(t *testing.T) {
	handler, _ := newTestHandler(t, &fakeUpstream{}, func(d *Deps) {
		d.ResourceAffinity = true
	})
	upstreamResp := &http.Response{
		StatusCode: 200,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(errBody{}),
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest("POST", "/agent/runs", nil)
	// The read failure is swallowed after WriteHeader: the client gets an
	// empty 200 rather than a half-written body.
	handler.sendUpstreamResponse(recorder, request, upstreamResp, SchedulerKey{ID: "k"}, "/agent/runs", false, "", 0)
	if recorder.Code != 200 {
		t.Errorf("status = %d, want 200 (headers already sent)", recorder.Code)
	}
	if recorder.Body.Len() != 0 {
		t.Errorf("body = %q, want empty", recorder.Body.String())
	}
}

func TestCacheableNonJSONResponseStreamsRaw(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "application/json"}, "<not json>"
		},
	}}
	handler, _ := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.SearchCacheTTLSeconds = 60
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
	})
	request := httptest.NewRequest("POST", "/search", strings.NewReader(`{"query":"x"}`))
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != 200 {
		t.Fatalf("status = %d", recorder.Code)
	}
	if recorder.Body.String() != "<not json>" {
		t.Errorf("body = %q, want raw passthrough", recorder.Body.String())
	}
	if recorder.Header().Get("x-cache") != "miss" {
		t.Error("x-cache miss header missing")
	}
	// The raw body was still cached: a second identical request hits it.
	// (Fresh request: the first ServeHTTP consumed the original body.)
	request2 := httptest.NewRequest("POST", "/search", strings.NewReader(`{"query":"x"}`))
	request2.Header.Set("authorization", "Bearer client_token_16")
	recorder2 := httptest.NewRecorder()
	handler.ServeHTTP(recorder2, request2)
	if recorder2.Header().Get("x-cache") != "hit" {
		t.Errorf("second request = %q (%s)", recorder2.Header().Get("x-cache"), recorder2.Body.String())
	}
}

func TestAffinityLookupErrorFallsBackToNextKey(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "text/plain"}, "ok"
		},
	}}
	handler, _ := newTestHandler(t, upstream, func(d *Deps) {
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
	})
	// Close the store: GetAffinity errors, the handler must fall back to
	// NextKey instead of failing the request.
	if err := handler.Deps.State.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("GET", "/agent/runs/run-1", nil)
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != 200 {
		t.Errorf("status = %d (%s)", recorder.Code, recorder.Body.String())
	}
}

func TestServeHTTPSkipsBodyReadForGET(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) {
			return 200, map[string]string{"content-type": "text/plain"}, "ok"
		},
	}}
	handler, _ := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
	})
	// GET with a body present: the body is not read or forwarded.
	request := httptest.NewRequest("GET", "/search", strings.NewReader("ignored-body"))
	request.Header.Set("authorization", "Bearer client_token_16")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != 200 {
		t.Errorf("status = %d", recorder.Code)
	}
	if upstream.requests[0].body != "" {
		t.Errorf("GET body forwarded = %q", upstream.requests[0].body)
	}
}
