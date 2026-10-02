package scheduler

import (
	"testing"
)

func TestWeightedRoundRobinSequence(t *testing.T) {
	s := New([]Key{
		{ID: "a", Value: "va", Weight: 2, Enabled: true},
		{ID: "b", Value: "vb", Weight: 1, Enabled: true},
	}, StrategyWeightedRoundRobin)
	var order []string
	for i := 0; i < 3; i++ {
		key, ok := s.Next(1000, nil)
		if !ok {
			t.Fatalf("iteration %d: no key", i)
		}
		order = append(order, key.ID)
	}
	// Node's weighted sequence is [a, a, b] in insertion order, rotating.
	want := []string{"a", "a", "b"}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("rotation %v mismatch: got %v", want, order)
		}
	}
}

func TestCooldownExclusionSkipsToHealthyKey(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: true},
		{ID: "b", Weight: 1, Enabled: true},
	}, StrategyRoundRobin)
	// First pick lands on a; cool it down. Next pick must be b.
	key, _ := s.Next(1000, nil)
	s.CoolDown(key.ID, 5000, "rate_limit")
	key2, ok := s.Next(1000, nil)
	if !ok || key2.ID == key.ID {
		t.Fatalf("cooldown key was selected again: %s", key2.ID)
	}
	// After cooldown expires, a is eligible again.
	key3, ok := s.Next(15000, nil)
	if !ok || key3.ID != key.ID {
		t.Fatalf("expired cooldown key not selected: %v", key3.ID)
	}
}

func TestDisabledKeyNeverSelected(t *testing.T) {
	s := New([]Key{{ID: "only", Weight: 1, Enabled: false}}, StrategyRoundRobin)
	if _, ok := s.Next(1000, nil); ok {
		t.Fatal("disabled key was selected")
	}
}

func TestLRUPicksLeastRecentlyUsed(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: true},
		{ID: "b", Weight: 1, Enabled: true},
	}, StrategyLRU)
	first, _ := s.Next(1000, nil)
	second, _ := s.Next(2000, nil)
	if first.ID == second.ID {
		t.Fatal("LRU picked the same key twice")
	}
	third, _ := s.Next(3000, nil)
	if third.ID != first.ID {
		t.Fatalf("LRU should wrap to least recent: got %s want %s", third.ID, first.ID)
	}
}

func TestFailureThresholdTripsCooldown(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	for i := 0; i < 2; i++ {
		if _, tripped := s.RecordFailure("a", int64(1000+i*100), 3, 60000, 120000, "transient_status"); tripped {
			t.Fatal("cooldown tripped before threshold")
		}
	}
	until, tripped := s.RecordFailure("a", 1200, 3, 60000, 120000, "transient_status")
	if !tripped || until != 1200+120000 {
		t.Fatalf("threshold trip mismatch: %d %v", until, tripped)
	}
	// Old failures outside the window must not count (window = 60s; at t=61500
	// the t=1000/1100 failures are 60.4-60.5s old and drop out).
	s2 := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	for i := 0; i < 2; i++ {
		s2.RecordFailure("a", int64(1000+i*100), 3, 60000, 120000, "transient_status")
	}
	if _, tripped := s2.RecordFailure("a", 61500, 3, 60000, 120000, "transient_status"); tripped {
		t.Fatal("stale failures tripped the threshold")
	}
}

func TestAdaptiveWeightFormula(t *testing.T) {
	s := New([]Key{{ID: "a", Value: "va", Weight: 2, Enabled: true}}, StrategyAdaptiveWeighted)
	// Perfect stats: success rate 1, latency 1000ms → reliability 1.5,
	// latencyFactor 1, penalty 1 → score 2*1.5 = 3 → weight round(18) = 18
	// clamped to 16.
	s.UpdateAdaptiveStats([]Stats{{
		ID: "a", Enabled: true, Weight: 2,
		TotalRequests: 10, SuccessCount: 10, LastLatencyMs: 1000,
	}})
	snap := s.Snapshot(0)[0]
	if snap.AdaptiveWeight != 16 {
		t.Fatalf("perfect-stats weight = %d, want 16 (clamped)", snap.AdaptiveWeight)
	}
	// Heavy 429 rate-limiting: rateLimitRate 0.5 + statusPenalty 3 → heavy penalty.
	s.UpdateAdaptiveStats([]Stats{{
		ID: "a", Enabled: true, Weight: 2,
		TotalRequests: 10, SuccessCount: 5, RateLimitCount: 5, LastStatus: 429, LastLatencyMs: 1000,
	}})
	snap = s.Snapshot(0)[0]
	// penalty = 1 + 0*3 + 0.5*6 + 0 + 0 + 3 + 0 = 7; score = 2*1.25/7 ≈ 0.357;
	// weight = round(clamp(0.357*6, 1, 16)) = round(2.143) = 2.
	if snap.AdaptiveWeight != 2 {
		t.Fatalf("penalized weight = %d, want 2", snap.AdaptiveWeight)
	}
}

func TestRemoveKeysRebuildsSequence(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: true},
		{ID: "b", Weight: 1, Enabled: true},
		{ID: "c", Weight: 1, Enabled: true},
	}, StrategyRoundRobin)
	s.RemoveKeys([]string{"a", "b"})
	for i := 0; i < 3; i++ {
		key, ok := s.Next(1000, nil)
		if !ok || key.ID != "c" {
			t.Fatalf("removed keys still in sequence: %v", key.ID)
		}
	}
}
