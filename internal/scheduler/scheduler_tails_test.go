package scheduler

import "testing"

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
