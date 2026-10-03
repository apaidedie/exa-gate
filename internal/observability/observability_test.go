package observability

import (
	"testing"
	"time"
)

func TestTrendWindow(t *testing.T) {
	cases := []struct {
		hours      int
		fallback   int
		wantHours  int
		wantLabel  string
		wantBucket int64
	}{
		{1, 24, 1, "近 1 小时", 5 * 60 * 1000},
		{24, 1, 24, "近 24 小时", 60 * 60 * 1000},
		{168, 24, 168, "近 7 天", 6 * 60 * 60 * 1000},
		{5, 24, 24, "近 24 小时", 60 * 60 * 1000},       // invalid -> fallback
		{0, 1, 1, "近 1 小时", 5 * 60 * 1000},           // invalid -> fallback
		{999, 168, 168, "近 7 天", 6 * 60 * 60 * 1000}, // invalid -> fallback
	}
	for _, c := range cases {
		w := TrendWindow(c.hours, c.fallback)
		if w.Hours != c.wantHours || w.Label != c.wantLabel || w.BucketMs != c.wantBucket {
			t.Errorf("TrendWindow(%d, %d) = %+v, want hours=%d label=%q bucket=%d",
				c.hours, c.fallback, w, c.wantHours, c.wantLabel, c.wantBucket)
		}
		if w.WindowMs != int64(w.Hours)*3600000 {
			t.Errorf("window ms = %d", w.WindowMs)
		}
	}
}

func TestBuildTrendsBucketFilling(t *testing.T) {
	now := time.Now().UnixMilli()
	hourStart := now / 3600000 * 3600000
	hourly := []HourlyCount{
		{Hour: hourStart, Requests: 10, Failures: 3, RateLimits: 2, AvgLatency: 150},
		{Hour: hourStart - 3600000, Requests: 4, Failures: 0, RateLimits: 0, AvgLatency: 50}, // outside the 1h window
	}
	trends := BuildTrends(hourStart, 3600000, hourly)
	if len(trends) != 1 {
		t.Fatalf("buckets = %d, want 1 (1h window, hourly bucket)", len(trends))
	}
	b := trends[0]
	if b.BucketStart != hourStart {
		t.Errorf("bucket start = %d, want %d", b.BucketStart, hourStart)
	}
	if b.Requests != 10 || b.Failures != 3 || b.RateLimits != 2 {
		t.Errorf("bucket counters = %+v", b)
	}
	if b.Success != 7 {
		t.Errorf("success = %d, want requests-failures = 7", b.Success)
	}
	if b.AvgLatencyMs != 150 {
		t.Errorf("avg latency = %v, want 150", b.AvgLatencyMs)
	}
}

func TestBuildTrendsEmptyAndClamping(t *testing.T) {
	// No hourly data: zero-filled buckets.
	trends := BuildTrends(time.Now().UnixMilli()-3600000, 3600000, nil)
	if len(trends) == 0 {
		t.Fatal("expected at least one bucket")
	}
	for _, b := range trends {
		if b.Requests != 0 || b.Failures != 0 || b.Success != 0 {
			t.Errorf("empty bucket not zero-filled: %+v", b)
		}
	}
	// Negative since clamps to 0; bucket count capped at 240.
	huge := BuildTrends(-1, 3600000, nil)
	if len(huge) > 240 {
		t.Errorf("bucket count = %d, want capped at 240", len(huge))
	}
	// Tiny bucket clamps up to 1 minute; huge clamps down to 1 day.
	small := BuildTrends(time.Now().UnixMilli()-60000, 100, nil)
	if small[0].BucketStart%60000 != 0 {
		t.Errorf("bucket not aligned to clamped 60000ms: %d", small[0].BucketStart)
	}
}

func TestBuildAlerts(t *testing.T) {
	base := AlertInput{Healthy: 5, AlertAvailableKeyMin: 1, AlertFailureRatePercent: 10, AlertRateLimitRatePercent: 20}

	// No requests and healthy keys: no alerts.
	if alerts := BuildAlerts(base); len(alerts) != 0 {
		t.Errorf("baseline alerts = %v, want none", alerts)
	}

	// Key availability: 0 healthy -> bad; at threshold -> warn; above -> none.
	bad := base
	bad.Healthy = 0
	bad.Disabled = 2
	bad.TotalKeys = 2
	alerts := BuildAlerts(bad)
	if len(alerts) != 1 || alerts[0].ID != "available_keys_low" || alerts[0].Severity != "bad" {
		t.Errorf("zero healthy = %+v", alerts)
	}
	warn := base
	warn.Healthy = 1
	alerts = BuildAlerts(warn)
	if len(alerts) != 1 || alerts[0].Severity != "warn" {
		t.Errorf("threshold healthy = %+v", alerts)
	}
	fine := base
	fine.Healthy = 2
	if alerts := BuildAlerts(fine); len(alerts) != 0 {
		t.Errorf("healthy above threshold = %+v", alerts)
	}

	// Failure rate: 3/10 = 30% >= 10%. Below the 5-failure spike floor,
	// so only the rate alert fires.
	failing := base
	failing.CurrentRequests = 10
	failing.CurrentFailures = 3
	alerts = BuildAlerts(failing)
	if len(alerts) != 1 || alerts[0].ID != "failure_rate_high" {
		t.Errorf("failure rate alerts = %+v", alerts)
	}

	// Rate-limit rate: 3/10 = 30% >= 20%.
	limited := base
	limited.Healthy = 5
	limited.CurrentRequests = 10
	limited.CurrentRateLimits = 3
	alerts = BuildAlerts(limited)
	if len(alerts) != 1 || alerts[0].ID != "rate_limit_rate_high" {
		t.Errorf("rate limit alerts = %+v", alerts)
	}

	// Failure spike: current >= max(5, 2*prev) and current > prev.
	spike := base
	spike.Healthy = 5
	spike.CurrentFailures = 10
	spike.PreviousFailures = 2
	alerts = BuildAlerts(spike)
	if len(alerts) != 1 || alerts[0].ID != "failure_spike" || alerts[0].Severity != "bad" {
		t.Errorf("failure spike = %+v", alerts)
	}
	// Below the absolute floor of 5: no alert.
	small := spike
	small.CurrentFailures = 4
	small.PreviousFailures = 1
	if alerts := BuildAlerts(small); len(alerts) != 0 {
		t.Errorf("spike below floor = %+v", alerts)
	}
	// Not doubling the previous hour: no alert.
	slow := spike
	slow.CurrentFailures = 10
	slow.PreviousFailures = 6 // max(5, 12) = 12 > 10
	if alerts := BuildAlerts(slow); len(alerts) != 0 {
		t.Errorf("non-doubling spike = %+v", alerts)
	}
	// Equal to previous: no alert (must strictly exceed).
	equal := spike
	equal.CurrentFailures = 5
	equal.PreviousFailures = 5
	if alerts := BuildAlerts(equal); len(alerts) != 0 {
		t.Errorf("equal spike = %+v", alerts)
	}

	// Rate-limit spike.
	rl := base
	rl.Healthy = 5
	rl.CurrentRateLimits = 8
	rl.PreviousRateLimits = 2
	alerts = BuildAlerts(rl)
	if len(alerts) != 1 || alerts[0].ID != "rate_limit_spike" || alerts[0].Severity != "warn" {
		t.Errorf("rate limit spike = %+v", alerts)
	}

	// Combined scenario: several alerts at once.
	worst := base
	worst.Healthy = 0
	worst.CurrentRequests = 10
	worst.CurrentFailures = 6
	worst.CurrentRateLimits = 6
	worst.PreviousFailures = 1
	worst.PreviousRateLimits = 1
	alerts = BuildAlerts(worst)
	ids := map[string]bool{}
	for _, a := range alerts {
		ids[a.ID] = true
	}
	for _, want := range []string{"available_keys_low", "failure_rate_high", "rate_limit_rate_high", "failure_spike", "rate_limit_spike"} {
		if !ids[want] {
			t.Errorf("combined scenario missing %q: %+v", want, alerts)
		}
	}
}
