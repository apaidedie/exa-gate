package retry

import (
	"errors"
	"net"
	"net/url"
	"syscall"
	"testing"
	"time"
)

func TestClassifyStatus(t *testing.T) {
	cases := []struct {
		status    int
		retryable bool
		reason    Reason
	}{
		{429, true, ReasonRateLimit},
		{402, true, ReasonCreditsExhausted},
		{408, true, ReasonTransientStatus},
		{409, true, ReasonTransientStatus},
		{425, true, ReasonTransientStatus},
		{500, true, ReasonTransientStatus},
		{502, true, ReasonTransientStatus},
		{503, true, ReasonTransientStatus},
		{504, true, ReasonTransientStatus},
		{200, false, ReasonOK},
		{301, false, ReasonOK},
		{399, false, ReasonOK},
		{400, false, ReasonClientStatus},
		{401, false, ReasonClientStatus},
		{403, false, ReasonClientStatus},
		{404, false, ReasonClientStatus},
		{422, false, ReasonClientStatus},
		// 5xx outside the retryable table falls through to the default branch,
		// matching the TypeScript semantics.
		{501, false, ReasonOK},
		{599, false, ReasonOK},
	}
	for _, c := range cases {
		got := ClassifyStatus(c.status)
		if got.Retryable != c.retryable || got.Reason != c.reason {
			t.Errorf("ClassifyStatus(%d) = {%v %v}, want {%v %v}", c.status, got.Retryable, got.Reason, c.retryable, c.reason)
		}
	}
}

type timeoutError struct{}

func (timeoutError) Error() string   { return "i/o timeout" }
func (timeoutError) Timeout() bool   { return true }
func (timeoutError) Temporary() bool { return true }

func TestClassifyError(t *testing.T) {
	dnsErr := &net.DNSError{Err: "no such host", Name: "api.exa.ai", IsNotFound: true}
	cases := []struct {
		name      string
		err       error
		retryable bool
		reason    Reason
	}{
		{"nil error", nil, false, ReasonUnknownError},
		{"net timeout", timeoutError{}, true, ReasonTimeout},
		{"context deadline message", errors.New("context deadline exceeded"), true, ReasonTimeout},
		{"timeout substring", errors.New("request canceled: i/o timeout"), true, ReasonTimeout},
		// Case-sensitive match locks the ported TypeScript semantics
		// (err.message.includes('timeout')).
		{"capitalized Timeout only", errors.New("Client.Timeout exceeded while awaiting headers"), false, ReasonUnknownError},
		{"connection refused", &net.OpError{Op: "dial", Err: syscall.ECONNREFUSED}, true, ReasonConnectionError},
		{"connection reset message", errors.New("read: connection reset by peer"), true, ReasonConnectionError},
		{"dns not found", dnsErr, true, ReasonConnectionError},
		{"wrapped timeout", &url.Error{Op: "Post", URL: "https://api.exa.ai", Err: timeoutError{}}, true, ReasonTimeout},
		{"wrapped refused", &url.Error{Op: "Post", URL: "https://api.exa.ai", Err: &net.OpError{Op: "dial", Err: syscall.ECONNREFUSED}}, true, ReasonConnectionError},
		{"plain error", errors.New("something else"), false, ReasonUnknownError},
		{"wrapped plain error", &url.Error{Op: "Post", URL: "https://api.exa.ai", Err: errors.New("nope")}, false, ReasonUnknownError},
	}
	for _, c := range cases {
		got := ClassifyError(c.err)
		if got.Retryable != c.retryable || got.Reason != c.reason {
			t.Errorf("%s: ClassifyError = {%v %v}, want {%v %v}", c.name, got.Retryable, got.Reason, c.retryable, c.reason)
		}
	}
}

func TestParseRetryAfterMs(t *testing.T) {
	cases := []struct {
		value  string
		wantMs int64
		ok     bool
	}{
		{"", 0, false},
		{"0", 0, true},
		{"5", 5000, true},
		{" 120 ", 120000, true},
		{"1.5", 1500, true},
		{"abc", 0, false},
		{"-5", 0, false},
	}
	for _, c := range cases {
		ms, ok := ParseRetryAfterMs(c.value)
		if ok != c.ok || (ok && ms != c.wantMs) {
			t.Errorf("ParseRetryAfterMs(%q) = (%d, %v), want (%d, %v)", c.value, ms, ok, c.wantMs, c.ok)
		}
	}

	future := time.Now().UTC().Add(60 * time.Second).Format("Mon, 02 Jan 2006 15:04:05 GMT")
	ms, ok := ParseRetryAfterMs(future)
	if !ok || ms < 55000 || ms > 65000 {
		t.Errorf("future HTTP-date = (%d, %v), want ~60000 with ok", ms, ok)
	}

	past := time.Now().UTC().Add(-60 * time.Second).Format("Mon, 02 Jan 2006 15:04:05 GMT")
	ms, ok = ParseRetryAfterMs(past)
	if !ok || ms != 0 {
		t.Errorf("past HTTP-date = (%d, %v), want (0, true)", ms, ok)
	}
}

func TestBackoffMs(t *testing.T) {
	table := []int64{100, 400, 1600}
	cases := []struct {
		attempt int
		want    int64
	}{
		{0, 100},
		{1, 400},
		{2, 1600},
		{3, 1600},  // clamps to last
		{99, 1600}, // clamps to last
		{-1, 100},  // clamps to first
	}
	for _, c := range cases {
		if got := BackoffMs(table, c.attempt); got != c.want {
			t.Errorf("BackoffMs(attempt=%d) = %d, want %d", c.attempt, got, c.want)
		}
	}
	if got := BackoffMs(nil, 3); got != 0 {
		t.Errorf("BackoffMs(nil) = %d, want 0", got)
	}
	if got := BackoffMs([]int64{250}, 0); got != 250 {
		t.Errorf("BackoffMs(single) = %d, want 250", got)
	}
}

func TestReasonConstants(t *testing.T) {
	// Lock the wire values: they surface in request logs and metrics labels.
	want := map[Reason]string{
		ReasonOK:               "ok",
		ReasonRateLimit:        "rate_limit",
		ReasonCreditsExhausted: "credits_exhausted",
		ReasonTransientStatus:  "transient_status",
		ReasonClientStatus:     "client_status",
		ReasonTimeout:          "timeout",
		ReasonConnectionError:  "connection_error",
		ReasonUnknownError:     "unknown_error",
	}
	for reason, value := range want {
		if string(reason) != value {
			t.Errorf("reason %q drifted to %q", value, string(reason))
		}
	}
}
