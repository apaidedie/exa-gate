package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/apaidedie/exa-gate/internal/state"
)

// TestEndToEndRateLimitFailover boots the real binary wiring (config -> store
// -> scheduler -> proxy -> admin) against a fake Exa upstream whose first
// response is a 429, and verifies the client still gets a 200 served by the
// second key while the first one cools down.
func TestEndToEndRateLimitFailover(t *testing.T) {
	var calls atomic.Int64
	upstreamSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.Header().Set("retry-after", "0")
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`{"error":"rate_limited"}`))
			return
		}
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"echo":%q,"results":[]}`, r.Header.Get("x-api-key"))))
	}))
	defer upstreamSrv.Close()

	statePath := filepath.Join(t.TempDir(), "e2e.sqlite")
	port := bootEnv(t, statePath)
	t.Setenv("EXA_KEYS", "key1:sk-one:1,key2:sk-two:1")
	t.Setenv("EXA_UPSTREAM_URL", upstreamSrv.URL+"/")
	t.Setenv("EXA_RATE_LIMIT_COOLDOWN_SECONDS", "300")

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- run(ctx) }()
	waitLive(t, port)

	// The proxied request must succeed: the first attempt hits key1 and gets
	// a 429, the retry lands on key2 and returns 200 with key2's value
	// echoed upstream.
	body := `{"query":"e2e"}`
	request, err := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/search", port), strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("authorization", "Bearer "+clientToken)
	request.Header.Set("content-type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Echo string `json:"echo"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatalf("proxied status = %d", response.StatusCode)
	}
	if payload.Echo != "sk-two" {
		t.Fatalf("echo = %q, want the failover key's value sk-two", payload.Echo)
	}
	if calls.Load() != 2 {
		t.Fatalf("upstream calls = %d, want 2 (429 then 200)", calls.Load())
	}

	stopRun(t, errCh, cancel)

	// The full path logged both attempts and cooled key1 down.
	store, err := state.Open(statePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	stats, err := store.ListKeyStats()
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]state.KeyStats{}
	for _, stat := range stats {
		byID[stat.ID] = stat
	}
	if byID["key1"].RateLimitCount != 1 {
		t.Errorf("key1 rate limit count = %d, want 1", byID["key1"].RateLimitCount)
	}
	if byID["key1"].CooldownUntil == 0 {
		t.Error("key1 was not cooled down after the 429")
	}
	if byID["key2"].SuccessCount != 1 {
		t.Errorf("key2 success count = %d, want 1", byID["key2"].SuccessCount)
	}
	logs, err := store.ListRequestLogs(state.LogFilter{From: 0})
	if err != nil || len(logs) != 1 {
		t.Fatalf("logs = %v, %v", logs, err)
	}
	if logs[0].Status != 200 || logs[0].Attempts != 2 || len(logs[0].KeyIDs) != 2 {
		t.Errorf("request log = %+v, want status 200 with 2 attempts", logs[0])
	}
}
