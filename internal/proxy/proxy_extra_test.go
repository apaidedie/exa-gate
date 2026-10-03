package proxy

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/apaidedie/exa-gate/internal/state"
)

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
