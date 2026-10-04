package proxy

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/apaidedie/exa-gate/internal/scheduler"
	"github.com/apaidedie/exa-gate/internal/state"
	"github.com/apaidedie/exa-gate/internal/upstream"
)

// prefixedUpstream adapts the real upstream client to the proxy interface,
// prefixing the configured base URL (same as cmd's baseUpstream).
type prefixedUpstream struct {
	client *upstream.Client
	base   string
}

func (p *prefixedUpstream) Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error) {
	return p.client.Do(p.base+pathAndQuery, method, headers, body, timeoutMs, clientGone)
}

// TestConcurrentProxyStress hammers the full handler with concurrent mixed
// traffic: same-body cache contention, unique-body misses and affinity
// create/reuse. It runs under the CI race detector (internal/proxy is in
// the -race scope) and asserts end-state invariants.
func TestConcurrentProxyStress(t *testing.T) {
	var upstreamHits atomic.Int64
	upstreamSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := upstreamHits.Add(1)
		payload := map[string]any{"hit": n}
		// Echo a creation id so /agent/runs responses carry affinity data.
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			if id, ok := body["id"].(string); ok && id != "" {
				payload["id"] = id
			}
		}
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(200)
		_ = json.NewEncoder(w).Encode(payload)
	}))
	defer upstreamSrv.Close()

	store, err := state.Open(filepath.Join(t.TempDir(), "stress.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	seeds := []state.KeySeed{
		{ID: "k1", Weight: 1, Enabled: true},
		{ID: "k2", Weight: 1, Enabled: true},
		{ID: "k3", Weight: 1, Enabled: true},
	}
	if err := store.SeedKeys(seeds); err != nil {
		t.Fatal(err)
	}
	schedKeys := make([]scheduler.Key, 0, len(seeds))
	for _, k := range seeds {
		schedKeys = append(schedKeys, scheduler.Key{ID: k.ID, Value: "value-" + k.ID, Weight: k.Weight, Enabled: true})
	}
	sched := scheduler.New(schedKeys, scheduler.StrategyRoundRobin)

	handler := &Handler{
		Deps: Deps{
			Upstream: &prefixedUpstream{client: upstream.New(upstreamSrv.URL, 8, false), base: upstreamSrv.URL},
			State:    store,
			NextKey: func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
				k, ok := sched.Next(now, exclude)
				return SchedulerKey{ID: k.ID, Value: k.Value}, ok
			},
			GetKey: func(id string) (SchedulerKey, bool) {
				k, ok := sched.GetKey(id)
				return SchedulerKey{ID: k.ID, Value: k.Value}, ok
			},
			GetByID: func(id string, now int64) (SchedulerKey, bool) {
				k, ok := sched.GetByID(id, now)
				return SchedulerKey{ID: k.ID, Value: k.Value}, ok
			},
			RecordFailure:            sched.RecordFailure,
			RecordSuccess:            sched.RecordSuccess,
			CoolDown:                 sched.CoolDown,
			SetDisabled:              sched.SetDisabled,
			ProxyTokens:              []string{"stress-client-token"},
			AllowedPaths:             []string{"/**"},
			MaxAttempts:              2,
			AttemptTimeoutMs:         5000,
			RetryBackoffMs:           []int64{1, 1},
			FailureThreshold:         3,
			FailureWindowSeconds:     60,
			CooldownSeconds:          120,
			RateLimitCooldownSeconds: 300,
			ResourceAffinity:         true,
			SearchCacheTTLSeconds:    5,
			MaxBodyBytes:             20971520,
		},
	}

	const workers = 40
	const perWorker = 50
	var wg sync.WaitGroup
	var failures atomic.Int64
	var issued atomic.Int64

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			for i := 0; i < perWorker; i++ {
				var request *http.Request
				switch i % 3 {
				case 0: // same body: cache contention
					request = httptest.NewRequest("POST", "/search", strings.NewReader(`{"query":"shared"}`))
				case 1: // unique body: cache misses
					request = httptest.NewRequest("POST", "/search", strings.NewReader(fmt.Sprintf(`{"query":"w%d-i%d"}`, worker, i)))
				default: // affinity create + reuse
					runID := fmt.Sprintf("run-%d-%d", worker, i)
					create := httptest.NewRequest("POST", "/agent/runs", strings.NewReader(fmt.Sprintf(`{"id":%q,"query":"affinity"}`, runID)))
					create.Header.Set("authorization", "Bearer stress-client-token")
					issued.Add(1)
					rec := httptest.NewRecorder()
					handler.ServeHTTP(rec, create)
					if rec.Code != 200 {
						failures.Add(1)
						continue
					}
					request = httptest.NewRequest("GET", "/agent/runs/"+runID, nil)
				}
				request.Header.Set("authorization", "Bearer stress-client-token")
				issued.Add(1)
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, request)
				if rec.Code != 200 {
					failures.Add(1)
				}
			}
		}(w)
	}
	wg.Wait()

	if failures.Load() != 0 {
		t.Errorf("%d of %d concurrent requests failed", failures.Load(), issued.Load())
	}
	// Every request (cache hits included) produces exactly one log row.
	if count, err := store.CountLogs(); err != nil || count != issued.Load() {
		t.Errorf("logged rows = %d (err %v), want %d", count, err, issued.Load())
	}
	// All keys stayed healthy: no failures means no cooldowns or disables.
	stats, err := store.ListKeyStats()
	if err != nil {
		t.Fatal(err)
	}
	for _, stat := range stats {
		if !stat.Enabled || stat.CooldownUntil != 0 {
			t.Errorf("key %s degraded under stress: %+v", stat.ID, stat)
		}
		if stat.SuccessCount == 0 {
			t.Errorf("key %s never served traffic", stat.ID)
		}
	}
}
