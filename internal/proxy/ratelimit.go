// Per-client-token request rate limiting for the proxy hot path. The
// EXA_PROXY_RATE_LIMIT_PER_MINUTE feature existed in the TypeScript
// implementation (@fastify/rate-limit) and is reimplemented here as a
// sliding window keyed by token id.
package proxy

import (
	"sync"
	"time"
)

// TokenLimiter allows at most limit requests per sliding window per client
// token. limit <= 0 disables limiting entirely (allow-all, zero allocations).
type TokenLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	now    func() time.Time
	hits   map[string][]time.Time
}

func NewTokenLimiter(limit int, window time.Duration) *TokenLimiter {
	if limit <= 0 || window <= 0 {
		return nil
	}
	return &TokenLimiter{
		limit:  limit,
		window: window,
		now:    time.Now,
		hits:   map[string][]time.Time{},
	}
}

// Allow records one hit for the token and reports whether it fits within
// the window. Unknown tokens are tracked independently.
func (l *TokenLimiter) Allow(tokenID string) bool {
	if l == nil {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	windowStart := now.Add(-l.window)
	kept := l.hits[tokenID][:0]
	for _, ts := range l.hits[tokenID] {
		if ts.After(windowStart) {
			kept = append(kept, ts)
		}
	}
	if len(kept) >= l.limit {
		l.hits[tokenID] = kept
		return false
	}
	kept = append(kept, now)
	l.hits[tokenID] = kept
	return true
}
