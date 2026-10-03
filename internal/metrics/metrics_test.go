package metrics

import (
	"strings"
	"testing"
)

func TestStatusGroupOf(t *testing.T) {
	cases := map[int64]string{
		200: "2xx", 204: "2xx", 299: "2xx",
		300: "3xx", 301: "3xx", 399: "3xx",
		400: "4xx", 401: "4xx", 429: "4xx", 499: "4xx",
		500: "5xx", 503: "5xx",
		100: "5xx", // default bucket outside 2xx-4xx
		199: "5xx",
	}
	for status, want := range cases {
		if got := statusGroupOf(status); got != want {
			t.Errorf("statusGroupOf(%d) = %q, want %q", status, got, want)
		}
	}
}

func TestEscapeLabel(t *testing.T) {
	cases := map[string]string{
		`plain`:      `plain`,
		`back\slash`: `back\\slash`,
		`quo"te`:     `quo\"te`,
		"new\nline":  `new\nline`,
		// Interpreted input: literal backslash, quote and a real newline.
		"a\\b\"c\nd": `a\\b\"c\nd`,
	}
	for input, want := range cases {
		if got := escapeLabel(input); got != want {
			t.Errorf("escapeLabel(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestRenderPrometheusShape(t *testing.T) {
	stats := []Stats{
		{ID: `we"ird`, TotalRequests: 10, SuccessCount: 7, FailureCount: 3, RateLimitCount: 2, CreditsExhaustedCount: 1, CooldownUntil: 555},
		{ID: "aaa", TotalRequests: 1, SuccessCount: 1},
	}
	ops := Operations{TotalKeys: 2, HealthyKeys: 1, CooldownKeys: 1, DisabledKeys: 0}
	out := RenderPrometheus(stats, ops, 3, 14, 42)

	required := []string{
		"# TYPE exa_proxy_requests_total counter",
		`exa_proxy_requests_total{key_id="aaa"} 1`,
		`exa_proxy_requests_total{key_id="we\"ird"} 10`,
		`exa_proxy_key_success_total{key_id="aaa"} 1`,
		`exa_proxy_key_failures_total{key_id="we\"ird"} 3`,
		`exa_proxy_key_rate_limits_total{key_id="we\"ird"} 2`,
		`exa_proxy_key_credits_exhausted_total{key_id="we\"ird"} 1`,
		`exa_proxy_key_cooldown_until_ms{key_id="we\"ird"} 555`,
		"exa_proxy_keys_total 2",
		"exa_proxy_keys_healthy 1",
		"exa_proxy_keys_cooldown 1",
		"exa_proxy_keys_disabled 0",
		"exa_proxy_alerts_active 3",
		"exa_proxy_log_retention_days 14",
		"exa_proxy_request_latency_p95_ms 42",
	}
	for _, want := range required {
		if !strings.Contains(out, want) {
			t.Errorf("exposition missing %q", want)
		}
	}
	// Keys are rendered in sorted order for stable diffs.
	if strings.Index(out, `key_id="aaa"`) > strings.Index(out, `key_id="we\"ird"`) {
		t.Error("keys not sorted by id")
	}
}

func TestRecordAndRenderCounters(t *testing.T) {
	RecordRequestStatus(200)
	RecordRequestStatus(503)
	RecordRequestStatus(503)
	RecordRetry("rate_limit")
	RecordUpstreamError("timeout")
	RecordRequestLatencyMs("/search", "2xx", 120)
	RecordRequestLatencyMs("/search", "2xx", 80)
	RecordCacheHit()
	RecordCacheMiss()
	RecordLogsTotal(1234)

	out := RenderPrometheus(nil, Operations{}, 0, 7, 0)
	if !strings.Contains(out, `exa_proxy_request_status_total{status_group="5xx"} 2`) {
		t.Error("5xx counter not aggregated")
	}
	if !strings.Contains(out, `exa_proxy_retries_total{reason="rate_limit"} 1`) {
		t.Error("retry counter missing")
	}
	if !strings.Contains(out, `exa_proxy_upstream_error_total{reason="timeout"} 1`) {
		t.Error("upstream error counter missing")
	}
	if !strings.Contains(out, `exa_proxy_request_latency_ms_sum{path="/search"} 200`) {
		t.Error("latency sum wrong")
	}
	if !strings.Contains(out, `exa_proxy_request_latency_ms_count{path="/search"} 2`) {
		t.Error("latency count wrong")
	}
	if !strings.Contains(out, "exa_proxy_request_logs_total 1234") {
		t.Error("logs total gauge wrong")
	}
	if !strings.Contains(out, "exa_proxy_search_cache_hits 1") {
		t.Error("cache hit counter missing")
	}
	// Retention gauge reflects the render argument, not global state.
	if !strings.Contains(out, "exa_proxy_log_retention_days 7") {
		t.Error("retention gauge wrong")
	}
}
