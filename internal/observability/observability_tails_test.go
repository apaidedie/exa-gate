package observability

import (
	"testing"
	"time"
)

func TestBuildTrendsClampsAndMultiHourBuckets(t *testing.T) {
	now := time.Now().UnixMilli()

	// since in the future: negative span clamps to a single bucket.
	future := BuildTrends(now+3600000, 3600000, nil)
	if len(future) != 1 {
		t.Errorf("future since buckets = %d, want 1", len(future))
	}

	// Very old since: bucket count capped at 240.
	ancient := BuildTrends(now-3000*3600000, 3600000, nil)
	if len(ancient) != 240 {
		t.Errorf("ancient since buckets = %d, want capped 240", len(ancient))
	}

	// A 6-hour bucket aggregates every hourly entry it spans.
	sixHourStart := now / (6 * 3600000) * (6 * 3600000)
	hourly := []HourlyCount{
		{Hour: sixHourStart, Requests: 3, Failures: 1, RateLimits: 1, AvgLatency: 100},
		{Hour: sixHourStart + 3600000, Requests: 5, Failures: 0, RateLimits: 0, AvgLatency: 200},
		{Hour: sixHourStart + 2*3600000, Requests: 2, Failures: 2, RateLimits: 0, AvgLatency: 50},
	}
	buckets := BuildTrends(sixHourStart, 6*3600000, hourly)
	if len(buckets) != 1 {
		t.Fatalf("6h bucket count = %d, want 1", len(buckets))
	}
	b := buckets[0]
	if b.Requests != 10 || b.Failures != 3 || b.RateLimits != 1 {
		t.Errorf("aggregated = %+v, want 10/3/1", b)
	}
	if b.Success != 7 {
		t.Errorf("success = %d, want 7", b.Success)
	}
	// AvgLatency reflects the LAST hourly entry seen in the bucket.
	if b.AvgLatencyMs != 50 {
		t.Errorf("avg latency = %v, want 50 (last entry wins)", b.AvgLatencyMs)
	}
}
