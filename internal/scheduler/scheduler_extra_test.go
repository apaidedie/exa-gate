package scheduler

import (
	"testing"
)

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
