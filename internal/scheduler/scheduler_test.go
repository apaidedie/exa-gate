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

func TestLRUStrategy(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: true},
		{ID: "b", Weight: 1, Enabled: true},
		{ID: "c", Weight: 1, Enabled: true},
	}, StrategyLRU)
	// Insertion order tiebreak: a, b, c on first round.
	for _, want := range []string{"a", "b", "c"} {
		key, ok := s.Next(1000, nil)
		if !ok || key.ID != want {
			t.Fatalf("first round: got %s (%v), want %s", key.ID, ok, want)
		}
	}
	// a is oldest now: picking again rotates back to a.
	key, _ := s.Next(2000, nil)
	if key.ID != "a" {
		t.Fatalf("second round: got %s, want a", key.ID)
	}
	// Excluding the LRU winner moves to the next candidate.
	key, _ = s.Next(3000, map[string]bool{"a": true})
	if key.ID != "b" {
		t.Fatalf("excluded selection: got %s, want b", key.ID)
	}
	// Everything excluded or cooled -> no key.
	if _, ok := s.Next(4000, map[string]bool{"a": true, "b": true, "c": true}); ok {
		t.Fatal("all-excluded selection returned a key")
	}
}

func TestAdaptiveWeightedSequence(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: true},
		{ID: "b", Weight: 1, Enabled: true},
	}, StrategyAdaptiveWeighted)
	// Before any stats, adaptive runtime falls back to the key weight (1 each).
	ids := []string{}
	for i := 0; i < 4; i++ {
		key, ok := s.Next(1000, nil)
		if !ok {
			t.Fatal("no key from adaptive sequence")
		}
		ids = append(ids, key.ID)
	}
	if ids[0] != "a" || ids[1] != "b" || ids[2] != "a" || ids[3] != "b" {
		t.Errorf("fallback rotation = %v", ids)
	}

	// b performs perfectly, a performs terribly: b should get a much larger
	// share of the sequence.
	s.UpdateAdaptiveStats([]Stats{
		{ID: "a", Enabled: true, TotalRequests: 10, SuccessCount: 0, FailureCount: 10, RateLimitCount: 10, LastStatus: 429, LastError: strPtr("rate_limit"), LastLatencyMs: 90000},
		{ID: "b", Enabled: true, TotalRequests: 10, SuccessCount: 10, LastLatencyMs: 100},
	})
	snapshot := s.Snapshot(1000)
	var scoreA, weightB int
	var scoreB float64
	for _, entry := range snapshot {
		if entry.ID == "a" {
			if entry.AdaptiveScore != 0.05 {
				t.Errorf("clamped low score = %v, want 0.05", entry.AdaptiveScore)
			}
			scoreA = entry.AdaptiveWeight
		}
		if entry.ID == "b" {
			scoreB = entry.AdaptiveScore
			weightB = entry.AdaptiveWeight
		}
	}
	if scoreA != 1 {
		t.Errorf("bad key weight = %d, want floor 1", scoreA)
	}
	if weightB != 16 {
		t.Errorf("great key weight = %d, want ceiling 16 (score %v)", weightB, scoreB)
	}
	// With weights 1:16, a full rotation of 17 picks yields a at most once.
	counts := map[string]int{}
	for i := 0; i < 17; i++ {
		key, ok := s.Next(2000, nil)
		if !ok {
			t.Fatal("adaptive rotation exhausted early")
		}
		counts[key.ID]++
	}
	if counts["a"] != 1 || counts["b"] != 16 {
		t.Errorf("adaptive distribution = %v, want a:1 b:16", counts)
	}
}

func TestUpdateAdaptiveStatsZeroTotalAndCooldown(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 3, Enabled: true}}, StrategyAdaptiveWeighted)
	s.UpdateAdaptiveStats([]Stats{{ID: "a", Enabled: true, TotalRequests: 0, CooldownUntil: 0}})
	snapshot := s.Snapshot(1000)
	if snapshot[0].AdaptiveWeight != 3 || snapshot[0].AdaptiveScore != 3 {
		t.Errorf("zero-total fallback = %+v, want score/weight from key weight 3", snapshot[0])
	}

	// Cooldown surfaced from stats is reflected in the snapshot.
	reason := "rate_limit"
	s.UpdateAdaptiveStats([]Stats{{ID: "a", Enabled: true, TotalRequests: 5, SuccessCount: 5, CooldownUntil: 5000, CooldownReason: &reason}})
	snapshot = s.Snapshot(1000)
	if !snapshot[0].CoolingDown || snapshot[0].CooldownUntil != 5000 || snapshot[0].CooldownReason == nil || *snapshot[0].CooldownReason != "rate_limit" {
		t.Errorf("cooldown from stats = %+v", snapshot[0])
	}
	// A later snapshot without cooldown clears it.
	s.UpdateAdaptiveStats([]Stats{{ID: "a", Enabled: true, TotalRequests: 5, SuccessCount: 5, CooldownUntil: 0}})
	snapshot = s.Snapshot(1000)
	if snapshot[0].CoolingDown || snapshot[0].CooldownReason != nil {
		t.Errorf("cooldown not cleared: %+v", snapshot[0])
	}
	// Disabled via stats.
	s.UpdateAdaptiveStats([]Stats{{ID: "a", Enabled: false, TotalRequests: 5, SuccessCount: 5}})
	snapshot = s.Snapshot(1000)
	if snapshot[0].Enabled {
		t.Error("stats disable not applied")
	}
	if _, ok := s.Next(2000, nil); ok {
		t.Error("disabled key selected")
	}
	// Unknown ids in stats are ignored without panic.
	s.UpdateAdaptiveStats([]Stats{{ID: "ghost", Enabled: true, TotalRequests: 1, SuccessCount: 1}})
}

func TestSetDisabledAndRecordSuccess(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: true},
		{ID: "b", Weight: 1, Enabled: true},
	}, StrategyRoundRobin)
	// Trip the circuit on a: two failures, then a success clears, then the
	// third failure alone must not trip (threshold 3).
	now := int64(1000)
	if _, tripped := s.RecordFailure("a", now, 3, 60000, 5000, "transient_status"); tripped {
		t.Fatal("circuit tripped below threshold")
	}
	s.RecordSuccess("a")
	if _, tripped := s.RecordFailure("a", now+1, 3, 60000, 5000, "transient_status"); tripped {
		t.Fatal("success did not clear failure history")
	}
	if until, tripped := s.RecordFailure("a", now+2, 3, 60000, 5000, "transient_status"); tripped {
		t.Fatalf("circuit tripped at 2 failures: until=%d", until)
	}

	// SetDisabled hides a key from selection regardless of cooldowns.
	s.SetDisabled("b", true)
	if _, ok := s.Next(now, nil); !ok {
		t.Fatal("healthy key a should still be selectable")
	}
	// a is now in cooldown from the previous assert? No — threshold never
	// tripped. Cool a down manually and expect nothing selectable.
	s.CoolDown("a", now+60000, "manual")
	if _, ok := s.Next(now+1, nil); ok {
		t.Fatal("selected a key that is cooling down")
	}
	s.SetDisabled("b", false)
	s.CoolDown("a", 0, "") // reset: clears cooldown AND failure timestamps
	if _, ok := s.Next(now+2, nil); !ok {
		t.Fatal("reset did not restore selection")
	}
}

func TestRecordFailureWindowAndTrip(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	// Two failures inside the window, one outside -> only two kept -> no trip.
	s.RecordFailure("a", 1000, 3, 5000, 5000, "timeout")
	s.RecordFailure("a", 2000, 3, 5000, 5000, "timeout")
	s.RecordFailure("a", 100000, 3, 5000, 5000, "timeout")
	if _, tripped := s.RecordFailure("a", 100001, 3, 5000, 5000, "timeout"); tripped {
		t.Fatal("aged failures counted toward the threshold")
	}
	// Fourth in-window failure trips (3 kept from 100000/100001 + this one).
	until, tripped := s.RecordFailure("a", 100002, 3, 5000, 5000, "timeout")
	if !tripped || until != 100002+5000 {
		t.Fatalf("trip = %v until=%d", tripped, until)
	}
	// Unknown key is a no-op.
	if _, tripped := s.RecordFailure("ghost", 1, 3, 5000, 5000, "timeout"); tripped {
		t.Error("unknown key tripped")
	}
}

func TestGetByIDAndGetKey(t *testing.T) {
	s := New([]Key{
		{ID: "a", Value: "va", Weight: 1, Enabled: true},
		{ID: "off", Weight: 1, Enabled: false},
	}, StrategyRoundRobin)
	key, ok := s.GetByID("a", 1000)
	if !ok || key.Value != "va" {
		t.Errorf("GetByID = %+v %v", key, ok)
	}
	// GetByID respects eligibility: disabled and cooling keys are rejected.
	if _, ok := s.GetByID("off", 1000); ok {
		t.Error("GetByID returned a disabled key")
	}
	s.CoolDown("a", 5000, "rate_limit")
	if _, ok := s.GetByID("a", 1000); ok {
		t.Error("GetByID returned a cooling key")
	}
	if _, ok := s.GetByID("ghost", 1000); ok {
		t.Error("GetByID returned an unknown key")
	}
	// GetKey ignores eligibility (admin surface).
	got, ok := s.GetKey("off")
	if !ok || got.ID != "off" {
		t.Errorf("GetKey disabled = %+v %v", got, ok)
	}
	if _, ok := s.GetKey("ghost"); ok {
		t.Error("GetKey returned an unknown key")
	}
}

func TestAddAndRemoveKeys(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	// Duplicate AddKey is a no-op.
	s.AddKey(Key{ID: "a", Weight: 5, Enabled: true})
	if n := len(s.Snapshot(0)); n != 1 {
		t.Fatalf("duplicate add changed count: %d", n)
	}
	added := s.AddKeys([]Key{
		{ID: "b", Weight: 1, Enabled: true},
		{ID: "a", Weight: 1, Enabled: true}, // duplicate
		{ID: "c", Weight: 1, Enabled: true},
	})
	if added != 2 {
		t.Fatalf("AddKeys added = %d, want 2", added)
	}
	// Rotation covers all three in insertion order.
	for _, want := range []string{"a", "b", "c"} {
		key, ok := s.Next(1000, nil)
		if !ok || key.ID != want {
			t.Fatalf("rotation: got %s (%v), want %s", key.ID, ok, want)
		}
	}
	// Bulk removal rebuilds the sequence once.
	s.RemoveKeys([]string{"a", "ghost"})
	s.RemoveKey("c")
	if remaining := s.Snapshot(1000); len(remaining) != 1 || remaining[0].ID != "b" {
		t.Fatalf("after removal = %+v", remaining)
	}
	if key, _ := s.Next(1000, nil); key.ID != "b" {
		t.Fatalf("post-removal selection = %s", key.ID)
	}
}

func TestNextHonoursKeyEnabledFlagAndCooldown(t *testing.T) {
	s := New([]Key{
		{ID: "a", Weight: 1, Enabled: false}, // disabled at config level
		{ID: "b", Weight: 1, Enabled: true},
	}, StrategyRoundRobin)
	key, ok := s.Next(1000, nil)
	if !ok || key.ID != "b" {
		t.Fatalf("got %s (%v), want b (a disabled)", key.ID, ok)
	}
	// A key created enabled but disabled via New seeding: !key.Enabled.
	s2 := New(nil, StrategyRoundRobin)
	if _, ok := s2.Next(1000, nil); ok {
		t.Fatal("empty scheduler returned a key")
	}
}

func strPtr(v string) *string { return &v }

func TestAddKeyFreshInsert(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	s.AddKey(Key{ID: "b", Value: "vb", Weight: 2, Enabled: true})
	if n := len(s.Snapshot(0)); n != 2 {
		t.Fatalf("count = %d, want 2", n)
	}
	// New key participates in rotation: insertion order a then b.
	second, _ := s.Next(1000, nil)
	if second.ID != "a" {
		t.Fatalf("first Next = %s, want a (existing key keeps its position)", second.ID)
	}
	third, _ := s.Next(1000, nil)
	if third.ID != "b" {
		t.Fatalf("second Next = %s, want b (freshly added)", third.ID)
	}
}

func TestCoolDownUnknownKeyNoop(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	s.CoolDown("ghost", 5000, "rate_limit") // must not panic
	if key, ok := s.Next(1000, nil); !ok || key.ID != "a" {
		t.Fatalf("noop cooldown broke selection: %s %v", key.ID, ok)
	}
}

func TestBuildSequenceSkipsMissingStates(t *testing.T) {
	s := New([]Key{{ID: "a", Weight: 1, Enabled: true}}, StrategyRoundRobin)
	// Directly corrupt the insertion order with an id that has no state.
	s.mu.Lock()
	s.order = append(s.order, "ghost")
	s.mu.Unlock()
	s.RemoveKey("a") // triggers a rebuild that must skip the ghost
	if key, ok := s.Next(1000, nil); ok {
		t.Fatalf("selection after corrupt rebuild = %s %v, want none", key.ID, ok)
	}
}

func TestMaxIntBranchesViaZeroTotalStats(t *testing.T) {
	// Weight above the floor: adaptive runtime keeps the key weight.
	s := New([]Key{{ID: "big", Weight: 5, Enabled: true}, {ID: "zero", Weight: 0, Enabled: true}}, StrategyAdaptiveWeighted)
	s.UpdateAdaptiveStats([]Stats{
		{ID: "big", Enabled: true, TotalRequests: 0},
		{ID: "zero", Enabled: true, TotalRequests: 0},
	})
	snapshot := s.Snapshot(1000)
	for _, entry := range snapshot {
		want := map[string]int{"big": 5, "zero": 1}[entry.ID]
		if entry.AdaptiveWeight != want {
			t.Errorf("%s adaptive weight = %d, want %d", entry.ID, entry.AdaptiveWeight, want)
		}
	}
}
