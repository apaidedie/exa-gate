// Package scheduler ports the TypeScript KeyScheduler: four selection
// strategies, cooldowns, failure-threshold circuits and the adaptive weight
// formula — with identical scoring/clamping math.
package scheduler

import (
	"math"
	"sort"
	"sync"
)

type Strategy string

const (
	StrategyRoundRobin         Strategy = "round_robin"
	StrategyWeightedRoundRobin Strategy = "weighted_round_robin"
	StrategyLRU                Strategy = "least_recently_used"
	StrategyAdaptiveWeighted   Strategy = "adaptive_weighted"
)

type Key struct {
	ID      string
	Value   string
	Weight  int
	Enabled bool
}

type KeyState struct {
	Key               Key
	Disabled          bool
	CooldownUntil     int64
	CooldownReason    *string
	LastUsedAt        int64
	FailureTimestamps []int64
}

type AdaptiveRuntime struct {
	Score  float64
	Weight int
}

type Stats struct {
	ID                    string
	Enabled               bool
	Weight                int
	TotalRequests         int64
	SuccessCount          int64
	FailureCount          int64
	RateLimitCount        int64
	TimeoutCount          int64
	CreditsExhaustedCount int64
	CooldownUntil         int64
	CooldownReason        *string
	LastStatus            int64
	LastError             *string
	LastLatencyMs         int64
}

func clamp(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

type Scheduler struct {
	mu                 sync.Mutex
	states             map[string]*KeyState
	order              []string // insertion order, mirrors TS Map iteration
	adaptive           map[string]AdaptiveRuntime
	sequence           []string
	pointer            int
	adaptiveSeqCache   []string
	adaptiveSeqCacheAt int64
	strategy           Strategy
}

func New(keys []Key, strategy Strategy) *Scheduler {
	s := &Scheduler{
		states:   make(map[string]*KeyState, len(keys)),
		adaptive: map[string]AdaptiveRuntime{},
		strategy: strategy,
	}
	for _, key := range keys {
		s.states[key.ID] = &KeyState{Key: key, Disabled: !key.Enabled}
		s.order = append(s.order, key.ID)
	}
	s.sequence = s.buildSequence()
	return s
}

func (s *Scheduler) buildSequence() []string {
	// Insertion order mirrors the TS Map iteration (config key order).
	var seq []string
	for _, id := range s.order {
		state, ok := s.states[id]
		if !ok {
			continue
		}
		copies := 1
		if s.strategy == StrategyWeightedRoundRobin {
			copies = state.Key.Weight
		}
		for i := 0; i < copies; i++ {
			seq = append(seq, state.Key.ID)
		}
	}
	s.pointer = 0
	s.adaptiveSeqCache = nil
	return seq
}

func (s *Scheduler) isEligible(state *KeyState, now int64, exclude map[string]bool) bool {
	return !state.Disabled && state.Key.Enabled && state.CooldownUntil <= now && !exclude[state.Key.ID]
}

func (s *Scheduler) adaptiveRuntimeFor(state *KeyState) AdaptiveRuntime {
	if runtime, ok := s.adaptive[state.Key.ID]; ok {
		return runtime
	}
	return AdaptiveRuntime{Score: float64(state.Key.Weight), Weight: state.Key.Weight}
}

func (s *Scheduler) adaptiveSequence(now int64, exclude map[string]bool) []string {
	if s.adaptiveSeqCache != nil && now-s.adaptiveSeqCacheAt < 1000 && len(exclude) == 0 {
		return s.adaptiveSeqCache
	}
	var seq []string
	for _, state := range s.orderedStates() {
		if !s.isEligible(state, now, exclude) {
			continue
		}
		for i := 0; i < s.adaptiveRuntimeFor(state).Weight; i++ {
			seq = append(seq, state.Key.ID)
		}
	}
	if len(exclude) == 0 {
		s.adaptiveSeqCache = seq
		s.adaptiveSeqCacheAt = now
	}
	return seq
}

func (s *Scheduler) orderedStates() []*KeyState {
	out := make([]*KeyState, 0, len(s.order))
	for _, id := range s.order {
		if state, ok := s.states[id]; ok {
			out = append(out, state)
		}
	}
	return out
}

func (s *Scheduler) Next(now int64, exclude map[string]bool) (Key, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if exclude == nil {
		exclude = map[string]bool{}
	}
	if s.strategy == StrategyLRU {
		var candidates []*KeyState
		for _, state := range s.orderedStates() {
			if s.isEligible(state, now, exclude) {
				candidates = append(candidates, state)
			}
		}
		if len(candidates) == 0 {
			return Key{}, false
		}
		sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].LastUsedAt < candidates[j].LastUsedAt })
		selected := candidates[0]
		selected.LastUsedAt = now
		return selected.Key, true
	}
	sequence := s.sequence
	if s.strategy == StrategyAdaptiveWeighted {
		sequence = s.adaptiveSequence(now, exclude)
	}
	if len(sequence) == 0 {
		return Key{}, false
	}
	for checked := 0; checked < len(sequence); checked++ {
		id := sequence[s.pointer%len(sequence)]
		s.pointer++
		state, ok := s.states[id]
		if ok && s.isEligible(state, now, exclude) {
			state.LastUsedAt = now
			return state.Key, true
		}
	}
	return Key{}, false
}

// UpdateAdaptiveStats ports updateAdaptiveStats: identical reliability,
// latency and penalty formulas with the same clamps (score 0.05..16,
// weight 1..16 = round(score*6)).
func (s *Scheduler) UpdateAdaptiveStats(stats []Stats) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.adaptiveSeqCache = nil
	for _, stat := range stats {
		state, ok := s.states[stat.ID]
		if !ok {
			continue
		}
		state.Disabled = !stat.Enabled
		state.CooldownUntil = max64(0, stat.CooldownUntil)
		if state.CooldownUntil > 0 && stat.CooldownReason != nil {
			state.CooldownReason = stat.CooldownReason
		} else {
			state.CooldownReason = nil
		}
		total := max64(0, stat.TotalRequests)
		if total == 0 {
			s.adaptive[stat.ID] = AdaptiveRuntime{Score: float64(state.Key.Weight), Weight: maxInt(1, state.Key.Weight)}
			continue
		}
		successRate := clamp(float64(stat.SuccessCount)/float64(total), 0, 1)
		failureRate := clamp(float64(stat.FailureCount)/float64(total), 0, 1)
		rateLimitRate := clamp(float64(stat.RateLimitCount)/float64(total), 0, 1)
		timeoutRate := clamp(float64(stat.TimeoutCount)/float64(total), 0, 1)
		creditsExhaustedRate := clamp(float64(stat.CreditsExhaustedCount)/float64(total), 0, 1)
		latencyMs := max64(1, stat.LastLatencyMs)
		if latencyMs < 1 {
			latencyMs = 500
		}
		reliabilityFactor := clamp(0.25+successRate*1.25, 0.25, 1.5)
		latencyFactor := clamp(1000/float64(latencyMs), 0.25, 2.5)
		statusPenalty := 0.0
		switch {
		case stat.LastStatus == 429:
			statusPenalty = 3
		case stat.LastStatus == 402:
			statusPenalty = 4
		case stat.LastStatus >= 500:
			statusPenalty = 1.5
		}
		errorPenalty := 0.0
		if stat.LastError != nil {
			errorPenalty = 0.5
		}
		penalty := 1 + failureRate*3 + rateLimitRate*6 + timeoutRate*4 + creditsExhaustedRate*8 + statusPenalty + errorPenalty
		score := clamp(float64(state.Key.Weight)*reliabilityFactor*latencyFactor/penalty, 0.05, 16)
		weight := int(math.Round(clamp(score*6, 1, 16)))
		s.adaptive[stat.ID] = AdaptiveRuntime{Score: score, Weight: weight}
	}
}

func (s *Scheduler) SetDisabled(id string, disabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if state, ok := s.states[id]; ok {
		state.Disabled = disabled
	}
}

func (s *Scheduler) CoolDown(id string, untilMs int64, reason string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.coolDownLocked(id, untilMs, reason)
}

// coolDownLocked must be called with s.mu held (sync.Mutex is not reentrant).
func (s *Scheduler) coolDownLocked(id string, untilMs int64, reason string) {
	state, ok := s.states[id]
	if !ok {
		return
	}
	state.CooldownUntil = untilMs
	if untilMs > 0 {
		r := reason
		state.CooldownReason = &r
	} else {
		state.CooldownReason = nil
		state.FailureTimestamps = nil
	}
}

func (s *Scheduler) RecordSuccess(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if state, ok := s.states[id]; ok {
		state.FailureTimestamps = nil
	}
}

// RecordFailure returns the cooldown deadline when the failure threshold trips.
func (s *Scheduler) RecordFailure(id string, now int64, threshold int, windowMs int64, cooldownMs int64, reason string) (int64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, ok := s.states[id]
	if !ok {
		return 0, false
	}
	state.FailureTimestamps = append(state.FailureTimestamps, now)
	kept := state.FailureTimestamps[:0]
	for _, ts := range state.FailureTimestamps {
		if now-ts <= windowMs {
			kept = append(kept, ts)
		}
	}
	minKeep := threshold * 2
	if minKeep < 100 {
		minKeep = 100
	}
	if len(kept) > minKeep {
		kept = kept[len(kept)-minKeep:]
	}
	state.FailureTimestamps = kept
	if threshold > 0 && len(state.FailureTimestamps) >= threshold {
		until := now + cooldownMs
		s.coolDownLocked(id, until, reason)
		return until, true
	}
	return 0, false
}

func (s *Scheduler) GetByID(id string, now int64) (Key, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, ok := s.states[id]
	if !ok || !s.isEligible(state, now, map[string]bool{}) {
		return Key{}, false
	}
	state.LastUsedAt = now
	return state.Key, true
}

func (s *Scheduler) GetKey(id string) (Key, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, ok := s.states[id]
	if !ok {
		return Key{}, false
	}
	return state.Key, true
}

func (s *Scheduler) AddKey(key Key) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.states[key.ID]; ok {
		return
	}
	s.states[key.ID] = &KeyState{Key: key, Disabled: !key.Enabled}
	s.order = append(s.order, key.ID)
	s.sequence = s.buildSequence()
}

func (s *Scheduler) AddKeys(keys []Key) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	added := 0
	for _, key := range keys {
		if _, ok := s.states[key.ID]; ok {
			continue
		}
		s.states[key.ID] = &KeyState{Key: key, Disabled: !key.Enabled}
		s.order = append(s.order, key.ID)
		added++
	}
	if added > 0 {
		s.sequence = s.buildSequence()
	}
	return added
}

func (s *Scheduler) RemoveKey(id string) {
	s.RemoveKeys([]string{id})
}

// RemoveKeys rebuilds the sequence once after bulk removal (mirrors addKeys).
func (s *Scheduler) RemoveKeys(ids []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	for _, id := range ids {
		if _, ok := s.states[id]; !ok {
			continue
		}
		delete(s.states, id)
		delete(s.adaptive, id)
		for idx, oid := range s.order {
			if oid == id {
				s.order = append(s.order[:idx], s.order[idx+1:]...)
				break
			}
		}
		removed++
	}
	if removed > 0 {
		s.sequence = s.buildSequence()
	}
}

type SnapshotEntry struct {
	ID             string  `json:"id"`
	Weight         int     `json:"weight"`
	Enabled        bool    `json:"enabled"`
	CoolingDown    bool    `json:"coolingDown"`
	CooldownUntil  int64   `json:"cooldownUntil"`
	CooldownReason *string `json:"cooldownReason"`
	LastUsedAt     int64   `json:"lastUsedAt"`
	AdaptiveScore  float64 `json:"adaptiveScore"`
	AdaptiveWeight int     `json:"adaptiveWeight"`
}

func (s *Scheduler) Snapshot(now int64) []SnapshotEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]SnapshotEntry, 0, len(s.states))
	for _, state := range s.orderedStates() {
		enabled := state.Key.Enabled && !state.Disabled
		rt := s.adaptiveRuntimeFor(state)
		out = append(out, SnapshotEntry{
			ID:             state.Key.ID,
			Weight:         state.Key.Weight,
			Enabled:        enabled,
			CoolingDown:    state.CooldownUntil > now,
			CooldownUntil:  state.CooldownUntil,
			CooldownReason: state.CooldownReason,
			LastUsedAt:     state.LastUsedAt,
			AdaptiveScore:  rt.Score,
			AdaptiveWeight: rt.Weight,
		})
	}
	return out
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
