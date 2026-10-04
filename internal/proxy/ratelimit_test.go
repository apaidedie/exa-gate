package proxy

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/apaidedie/exa-gate/internal/state"
)

func TestTokenLimiterSlidingWindow(t *testing.T) {
	limiter := NewTokenLimiter(3, time.Minute)
	if limiter == nil {
		t.Fatal("limiter nil")
	}
	now := time.UnixMilli(0)
	ticks := []time.Time{}
	limiter.now = func() time.Time { return now }
	for i := 0; i < 3; i++ {
		now = now.Add(time.Second)
		if !limiter.Allow("tok") {
			t.Fatalf("hit %d rejected within limit", i+1)
		}
		ticks = append(ticks, now)
	}
	// Fourth hit inside the window is rejected.
	now = now.Add(time.Second)
	if limiter.Allow("tok") {
		t.Fatal("hit 4 allowed over limit")
	}
	// A different token has its own bucket.
	if !limiter.Allow("other") {
		t.Fatal("independent token rejected")
	}
	// Sliding: after the first hit ages out, a new one fits again.
	now = ticks[0].Add(time.Minute + time.Second)
	if !limiter.Allow("tok") {
		t.Fatal("aged hit not released")
	}
	// Zero/negative limits disable the limiter entirely.
	if NewTokenLimiter(0, time.Minute) != nil {
		t.Error("limit 0 should disable the limiter")
	}
	if (*TokenLimiter)(nil).Allow("tok") != true {
		t.Error("nil limiter must allow all")
	}
}

func TestRateLimitEnforcedInServeHTTP(t *testing.T) {
	upstream := &fakeUpstream{responses: []func(r *http.Request) (int, map[string]string, string){
		func(*http.Request) (int, map[string]string, string) { return 200, nil, "ok" },
		func(*http.Request) (int, map[string]string, string) { return 200, nil, "ok" },
	}}
	handler, store := newTestHandler(t, upstream, func(d *Deps) {
		d.ResourceAffinity = false
		d.RateLimiter = NewTokenLimiter(2, time.Minute)
		d.NextKey = func(now int64, exclude map[string]bool) (SchedulerKey, bool) {
			return SchedulerKey{ID: "k1", Value: "v1"}, true
		}
	})
	do := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest("GET", "/search", nil)
		request.Header.Set("authorization", "Bearer client_token_16")
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}
	if w := do(); w.Code != 200 {
		t.Fatalf("hit 1 = %d", w.Code)
	}
	if w := do(); w.Code != 200 {
		t.Fatalf("hit 2 = %d", w.Code)
	}
	if w := do(); w.Code != 429 {
		t.Fatalf("hit 3 = %d, want 429 (%s)", w.Code, w.Body.String())
	}
	w4 := do()
	if w4.Code != 429 {
		t.Fatalf("hit 4 = %d, want 429", w4.Code)
	}
	if w4.Header().Get("retry-after") == "" {
		t.Error("retry-after missing on 429")
	}
	logs, _ := store.ListRequestLogs(state.LogFilter{From: 0, Status: "429"})
	if len(logs) != 2 || logs[0].ErrorCode == nil || *logs[0].ErrorCode != "rate_limited" {
		t.Errorf("rate-limited logs = %+v", logs)
	}
	// Upstream saw only the two allowed requests.
	if len(upstream.requests) != 2 {
		t.Errorf("upstream hits = %d, want 2", len(upstream.requests))
	}
}

func TestCacheEvictsSoonestToExpire(t *testing.T) {
	c := &responseCache{entries: map[string]cacheEntry{}}
	// Fill to capacity-3 with long-lived entries.
	for i := 0; i < cacheMaxEntries-3; i++ {
		c.set(fillKey(i), cacheEntry{body: []byte("x")}, 120000)
	}
	// "soon" expires first; "mid" and "long" live much longer. Adding "soon"
	// reaches capacity (no eviction yet); the next insert must evict "soon"
	// rather than a random entry.
	c.set("mid", cacheEntry{body: []byte("m")}, 60000)
	c.set("long", cacheEntry{body: []byte("l")}, 180000)
	c.set("soon", cacheEntry{body: []byte("s")}, 1000)
	c.set("extra", cacheEntry{body: []byte("e")}, 120000)

	if len(c.entries) != cacheMaxEntries {
		t.Fatalf("size = %d, want %d", len(c.entries), cacheMaxEntries)
	}
	if _, ok := c.entries["soon"]; ok {
		t.Error("soonest-to-expire entry survived eviction")
	}
	for _, keep := range []string{"mid", "long", "extra"} {
		if _, ok := c.entries[keep]; !ok {
			t.Errorf("live entry %q was evicted", keep)
		}
	}
}

func fillKey(i int) string {
	return "fill-" + string(rune('a'+i%26)) + string(rune('a'+(i/26)%26)) + string(rune('a'+(i/676)%26)) + string(rune('a'+(i/17576)%26))
}
