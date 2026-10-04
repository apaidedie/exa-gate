// Package metrics produces the Prometheus text exposition with the exact
// metric families the TypeScript implementation exposes (Grafana panels
// keep working unchanged).
package metrics

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Stats struct {
	ID                    string
	TotalRequests         int64
	SuccessCount          int64
	FailureCount          int64
	RateLimitCount        int64
	TimeoutCount          int64
	CreditsExhaustedCount int64
	CooldownUntil         int64
}

type Operations struct {
	TotalKeys    int64
	HealthyKeys  int64
	CooldownKeys int64
	DisabledKeys int64
}

// counterState splits hot-path counters (atomic, lock-free — hit at least
// once per proxied request) from dynamic-label maps (mutex-guarded, only
// touched on retries/errors/latency bookkeeping).
type counterState struct {
	statusGroups   [4]atomic.Int64 // indexed by statusGroupIndex: 2xx,3xx,4xx,5xx
	cacheHits      atomic.Int64
	cacheMisses    atomic.Int64
	logsTotal      atomic.Int64
	mu             sync.Mutex
	retryReasons   map[string]int64 // reason -> count
	upstreamErrors map[string]int64 // reason -> count
	latencySum     map[string]int64 // path bucket -> cumulative
	latencyCount   map[string]int64 // path bucket -> count
}

var state = newCounterState()

// resetForTest swaps in a fresh counter state so tests start from zero
// regardless of execution order.
func resetForTest() { state = newCounterState() }

func newCounterState() *counterState {
	return &counterState{
		retryReasons:   map[string]int64{},
		upstreamErrors: map[string]int64{},
		latencySum:     map[string]int64{},
		latencyCount:   map[string]int64{},
	}
}

func statusGroupOf(status int64) string {
	switch {
	case status >= 200 && status < 300:
		return "2xx"
	case status >= 300 && status < 400:
		return "3xx"
	case status >= 400 && status < 500:
		return "4xx"
	default:
		return "5xx"
	}
}

func statusGroupIndex(group string) int {
	switch group {
	case "2xx":
		return 0
	case "3xx":
		return 1
	case "4xx":
		return 2
	default:
		return 3
	}
}

// RecordRequestStatus counts one completed proxy request by status group.
func RecordRequestStatus(status int64) {
	state.statusGroups[statusGroupIndex(statusGroupOf(status))].Add(1)
}

// RecordRetry counts one retry by classified reason.
func RecordRetry(reason string) {
	state.mu.Lock()
	defer state.mu.Unlock()
	state.retryReasons[reason]++
}

// RecordUpstreamError counts one upstream error by classified reason.
func RecordUpstreamError(reason string) {
	state.mu.Lock()
	defer state.mu.Unlock()
	state.upstreamErrors[reason]++
}

// RecordRequestLatencyMs accumulates request latency per path.
func RecordRequestLatencyMs(path string, statusGroup string, latencyMs int64) {
	state.mu.Lock()
	defer state.mu.Unlock()
	state.latencySum[path] += latencyMs
	state.latencyCount[path]++
}

// RecordCacheHit / RecordCacheMiss count /search cache outcomes.
func RecordCacheHit() {
	state.cacheHits.Add(1)
}

func RecordCacheMiss() {
	state.cacheMisses.Add(1)
}

// RecordLogsTotal snapshots the request-log row count.
func RecordLogsTotal(count int64) {
	state.logsTotal.Store(count)
}

// RenderPrometheus composes the exposition text. Key rows come from the
// live stats snapshot; operational counters from in-memory state. Only the
// dynamic-label maps need the lock; hot counters are atomic.
func RenderPrometheus(stats []Stats, operations Operations, alertsActive int64, logRetentionDays int64, latencyP95Ms int64) string {
	state.mu.Lock()
	defer state.mu.Unlock()
	var b strings.Builder

	b.WriteString("# HELP exa_proxy_requests_total Total upstream attempts by key\n")
	b.WriteString("# TYPE exa_proxy_requests_total counter\n")
	b.WriteString("# HELP exa_proxy_key_success_total Successful upstream attempts by key\n")
	b.WriteString("# TYPE exa_proxy_key_success_total counter\n")
	b.WriteString("# HELP exa_proxy_key_failures_total Failed upstream attempts by key\n")
	b.WriteString("# TYPE exa_proxy_key_failures_total counter\n")
	b.WriteString("# HELP exa_proxy_key_rate_limits_total 429 upstream responses by key\n")
	b.WriteString("# TYPE exa_proxy_key_rate_limits_total counter\n")
	b.WriteString("# HELP exa_proxy_key_credits_exhausted_total 402 upstream responses by key\n")
	b.WriteString("# TYPE exa_proxy_key_credits_exhausted_total counter\n")
	b.WriteString("# HELP exa_proxy_key_cooldown_until_ms Cooldown deadline per key\n")
	b.WriteString("# TYPE exa_proxy_key_cooldown_until_ms gauge\n")

	ids := make([]string, 0, len(stats))
	byID := map[string]Stats{}
	for _, stat := range stats {
		ids = append(ids, stat.ID)
		byID[stat.ID] = stat
	}
	sort.Strings(ids)
	for _, id := range ids {
		stat := byID[id]
		// Manual quoting (not %q): escapeLabel already escapes per the
		// Prometheus text format; %q would double-escape.
		idLabel := escapeLabel(id)
		fmt.Fprintf(&b, "exa_proxy_requests_total{key_id=\"%s\"} %d\n", idLabel, stat.TotalRequests)
		fmt.Fprintf(&b, "exa_proxy_key_success_total{key_id=\"%s\"} %d\n", idLabel, stat.SuccessCount)
		fmt.Fprintf(&b, "exa_proxy_key_failures_total{key_id=\"%s\"} %d\n", idLabel, stat.FailureCount)
		fmt.Fprintf(&b, "exa_proxy_key_rate_limits_total{key_id=\"%s\"} %d\n", idLabel, stat.RateLimitCount)
		fmt.Fprintf(&b, "exa_proxy_key_credits_exhausted_total{key_id=\"%s\"} %d\n", idLabel, stat.CreditsExhaustedCount)
		fmt.Fprintf(&b, "exa_proxy_key_cooldown_until_ms{key_id=\"%s\"} %d\n", idLabel, stat.CooldownUntil)
	}

	b.WriteString("# HELP exa_proxy_keys_total Configured upstream keys\n# TYPE exa_proxy_keys_total gauge\n")
	fmt.Fprintf(&b, "exa_proxy_keys_total %d\n", operations.TotalKeys)
	b.WriteString("# HELP exa_proxy_keys_healthy Upstream keys currently enabled and outside cooldown\n# TYPE exa_proxy_keys_healthy gauge\n")
	fmt.Fprintf(&b, "exa_proxy_keys_healthy %d\n", operations.HealthyKeys)
	b.WriteString("# HELP exa_proxy_keys_cooldown Upstream keys currently in cooldown\n# TYPE exa_proxy_keys_cooldown gauge\n")
	fmt.Fprintf(&b, "exa_proxy_keys_cooldown %d\n", operations.CooldownKeys)
	b.WriteString("# HELP exa_proxy_keys_disabled Upstream keys disabled by configuration or operator action\n# TYPE exa_proxy_keys_disabled gauge\n")
	fmt.Fprintf(&b, "exa_proxy_keys_disabled %d\n", operations.DisabledKeys)
	b.WriteString("# HELP exa_proxy_alerts_active Active admin-console alerts\n# TYPE exa_proxy_alerts_active gauge\n")
	fmt.Fprintf(&b, "exa_proxy_alerts_active %d\n", alertsActive)
	b.WriteString("# HELP exa_proxy_log_retention_days Request log retention\n# TYPE exa_proxy_log_retention_days gauge\n")
	fmt.Fprintf(&b, "exa_proxy_log_retention_days %d\n", logRetentionDays)
	b.WriteString("# HELP exa_proxy_request_logs_total Stored request log rows\n# TYPE exa_proxy_request_logs_total gauge\n")
	fmt.Fprintf(&b, "exa_proxy_request_logs_total %d\n", state.logsTotal.Load())

	b.WriteString("# HELP exa_proxy_request_status_total Completed proxy requests by status group\n# TYPE exa_proxy_request_status_total counter\n")
	for _, group := range []string{"2xx", "3xx", "4xx", "5xx"} {
		fmt.Fprintf(&b, "exa_proxy_request_status_total{status_group=%q} %d\n", group, state.statusGroups[statusGroupIndex(group)].Load())
	}

	reasons := sortedKeys(state.retryReasons)
	b.WriteString("# HELP exa_proxy_retries_total Retried upstream attempts by reason\n# TYPE exa_proxy_retries_total counter\n")
	for _, reason := range reasons {
		fmt.Fprintf(&b, "exa_proxy_retries_total{reason=\"%s\"} %d\n", escapeLabel(reason), state.retryReasons[reason])
	}
	errReasons := sortedKeys(state.upstreamErrors)
	b.WriteString("# HELP exa_proxy_upstream_error_total Upstream errors by reason\n# TYPE exa_proxy_upstream_error_total counter\n")
	for _, reason := range errReasons {
		fmt.Fprintf(&b, "exa_proxy_upstream_error_total{reason=\"%s\"} %d\n", escapeLabel(reason), state.upstreamErrors[reason])
	}

	paths := sortedKeys(state.latencySum)
	b.WriteString("# HELP exa_proxy_request_latency_ms_sum Cumulative proxy latency per path\n# TYPE exa_proxy_request_latency_ms_sum counter\n")
	for _, path := range paths {
		fmt.Fprintf(&b, "exa_proxy_request_latency_ms_sum{path=\"%s\"} %d\n", escapeLabel(path), state.latencySum[path])
	}
	b.WriteString("# HELP exa_proxy_request_latency_ms_count Proxy requests per path\n# TYPE exa_proxy_request_latency_ms_count counter\n")
	for _, path := range paths {
		fmt.Fprintf(&b, "exa_proxy_request_latency_ms_count{path=\"%s\"} %d\n", escapeLabel(path), state.latencyCount[path])
	}
	b.WriteString("# HELP exa_proxy_request_latency_p95_ms p95 proxy latency (recent window)\n# TYPE exa_proxy_request_latency_p95_ms gauge\n")
	fmt.Fprintf(&b, "exa_proxy_request_latency_p95_ms %d\n", latencyP95Ms)

	b.WriteString("# HELP exa_proxy_search_cache_hits Search response cache hits\n# TYPE exa_proxy_search_cache_hits counter\n")
	fmt.Fprintf(&b, "exa_proxy_search_cache_hits %d\n", state.cacheHits.Load())
	b.WriteString("# HELP exa_proxy_search_cache_misses Search response cache misses\n# TYPE exa_proxy_search_cache_misses counter\n")
	fmt.Fprintf(&b, "exa_proxy_search_cache_misses %d\n", state.cacheMisses.Load())

	return b.String()
}

func sortedKeys(m map[string]int64) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func escapeLabel(value string) string {
	value = strings.ReplaceAll(value, "\\", "\\\\")
	value = strings.ReplaceAll(value, "\"", "\\\"")
	value = strings.ReplaceAll(value, "\n", "\\n")
	return value
}

// Now re-exported for proxy use.
var _ = time.Now
