package proxy

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
