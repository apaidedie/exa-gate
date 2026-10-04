// Package observability implements the trend chart and alert logic.
package observability

import (
	"fmt"
	"math"
	"time"
)

type TrendBucket struct {
	BucketStart  int64   `json:"bucketStart"`
	Requests     int64   `json:"requests"`
	Success      int64   `json:"success"`
	Failures     int64   `json:"failures"`
	RateLimits   int64   `json:"rateLimits"`
	AvgLatencyMs float64 `json:"avgLatencyMs"`
	P95LatencyMs int64   `json:"p95LatencyMs"`
}

type Alert struct {
	ID       string  `json:"id"`
	Severity string  `json:"severity"`
	Title    string  `json:"title"`
	Message  string  `json:"message"`
	Value    float64 `json:"value"`
}

type Window struct {
	Hours    int    `json:"hours"`
	Label    string `json:"label"`
	BucketMs int64  `json:"bucketMs"`
	WindowMs int64  `json:"windowMs"`
}

func TrendWindow(hours, fallbackHours int) Window {
	validHours := map[int]bool{1: true, 24: true, 168: true}
	if !validHours[hours] {
		hours = fallbackHours
	}
	var bucketMs int64
	switch {
	case hours <= 2:
		bucketMs = 5 * 60 * 1000
	case hours <= 48:
		bucketMs = 60 * 60 * 1000
	default:
		bucketMs = 6 * 60 * 60 * 1000
	}
	label := fmt.Sprintf("近 %d 小时", hours)
	switch hours {
	case 1:
		label = "近 1 小时"
	case 168:
		label = "近 7 天"
	}
	return Window{Hours: hours, Label: label, BucketMs: bucketMs, WindowMs: int64(hours) * 3600000}
}

type HourlyCount struct {
	Hour       int64   `json:"hour"`
	Requests   int64   `json:"requests"`
	Failures   int64   `json:"failures"`
	RateLimits int64   `json:"rateLimits"`
	AvgLatency float64 `json:"avgLatency"`
}

// BuildTrends fills pre-initialized buckets from hourly aggregated counts.
func BuildTrends(sinceMs, bucketMs int64, hourly []HourlyCount) []TrendBucket {
	safeBucket := bucketMs
	if safeBucket < 60000 {
		safeBucket = 60000
	}
	if safeBucket > 86400000 {
		safeBucket = 86400000
	}
	now := time.Now().UnixMilli()
	start := (max64(0, sinceMs) / safeBucket) * safeBucket
	bucketCount := int64(math.Ceil(float64(now-start) / float64(safeBucket)))
	if bucketCount > 240 {
		bucketCount = 240
	}
	if bucketCount < 1 {
		bucketCount = 1
	}

	// Index hourly counts by bucket start for O(1) lookup
	byHour := make(map[int64]HourlyCount, len(hourly))
	for _, h := range hourly {
		byHour[h.Hour] = h
	}

	var trends []TrendBucket
	for i := int64(0); i < bucketCount; i++ {
		bucketStart := start + i*safeBucket
		bucketEnd := bucketStart + safeBucket
		bucket := TrendBucket{BucketStart: bucketStart}
		for hour := bucketStart / 3600000 * 3600000; hour < bucketEnd; hour += 3600000 {
			if hc, ok := byHour[hour]; ok {
				bucket.Requests += hc.Requests
				bucket.Failures += hc.Failures
				bucket.RateLimits += hc.RateLimits
				if hc.Requests > 0 {
					bucket.AvgLatencyMs = hc.AvgLatency
				}
			}
		}
		bucket.Success = bucket.Requests - bucket.Failures
		trends = append(trends, bucket)
	}
	return trends
}

type AlertInput struct {
	Healthy                   int     `json:"healthy"`
	Disabled                  int     `json:"disabled"`
	TotalKeys                 int     `json:"totalKeys"`
	CurrentRequests           int64   `json:"currentRequests"`
	CurrentFailures           int64   `json:"currentFailures"`
	CurrentRateLimits         int64   `json:"currentRateLimits"`
	PreviousFailures          int64   `json:"previousFailures"`
	PreviousRateLimits        int64   `json:"previousRateLimits"`
	AlertAvailableKeyMin      int     `json:"alertAvailableKeyMin"`
	AlertFailureRatePercent   float64 `json:"alertFailureRatePercent"`
	AlertRateLimitRatePercent float64 `json:"alertRateLimitRatePercent"`
}

func BuildAlerts(input AlertInput) []Alert {
	var alerts []Alert
	failureRate := 0.0
	rateLimitRate := 0.0
	if input.CurrentRequests > 0 {
		failureRate = float64(input.CurrentFailures) / float64(input.CurrentRequests) * 100
		rateLimitRate = float64(input.CurrentRateLimits) / float64(input.CurrentRequests) * 100
	}

	if input.Healthy <= input.AlertAvailableKeyMin {
		severity := "warn"
		if input.Healthy == 0 {
			severity = "bad"
		}
		alerts = append(alerts, Alert{ID: "available_keys_low", Severity: severity, Title: "可用密钥过低",
			Message: fmt.Sprintf("当前可用密钥 %d 个，低于阈值 %d。", input.Healthy, input.AlertAvailableKeyMin),
			Value:   float64(input.Healthy)})
	}
	if failureRate >= input.AlertFailureRatePercent && input.CurrentRequests > 0 {
		alerts = append(alerts, Alert{ID: "failure_rate_high", Severity: "warn", Title: "失败率偏高",
			Message: fmt.Sprintf("近 1 小时失败率 %.2f%%。", failureRate), Value: math.Round(failureRate*100) / 100})
	}
	if rateLimitRate >= input.AlertRateLimitRatePercent && input.CurrentRequests > 0 {
		alerts = append(alerts, Alert{ID: "rate_limit_rate_high", Severity: "warn", Title: "429 比例偏高",
			Message: fmt.Sprintf("近 1 小时 429 比例 %.2f%%。", rateLimitRate), Value: math.Round(rateLimitRate*100) / 100})
	}
	if input.CurrentFailures >= max64(5, input.PreviousFailures*2) && input.CurrentFailures > input.PreviousFailures {
		alerts = append(alerts, Alert{ID: "failure_spike", Severity: "bad", Title: "失败突增",
			Message: fmt.Sprintf("近 1 小时失败 %d 次，上一小时 %d 次。", input.CurrentFailures, input.PreviousFailures),
			Value:   float64(input.CurrentFailures)})
	}
	if input.CurrentRateLimits >= max64(5, input.PreviousRateLimits*2) && input.CurrentRateLimits > input.PreviousRateLimits {
		alerts = append(alerts, Alert{ID: "rate_limit_spike", Severity: "warn", Title: "429 突增",
			Message: fmt.Sprintf("近 1 小时 429 %d 次，上一小时 %d 次。", input.CurrentRateLimits, input.PreviousRateLimits),
			Value:   float64(input.CurrentRateLimits)})
	}
	return alerts
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
