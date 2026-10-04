// Package retry ports the TypeScript retry classification semantics exactly.
package retry

import (
	"fmt"
	"math"
	"net"
	"net/url"
	"strings"
	"syscall"
	"time"
)

type Reason string

const (
	ReasonOK               Reason = "ok"
	ReasonRateLimit        Reason = "rate_limit"
	ReasonCreditsExhausted Reason = "credits_exhausted"
	ReasonTransientStatus  Reason = "transient_status"
	ReasonClientStatus     Reason = "client_status"
	ReasonTimeout          Reason = "timeout"
	ReasonConnectionError  Reason = "connection_error"
	ReasonUnknownError     Reason = "unknown_error"
)

type Decision struct {
	Retryable bool
	Reason    Reason
}

var retryableStatuses = map[int]bool{408: true, 409: true, 425: true, 429: true, 500: true, 502: true, 503: true, 504: true}

func ClassifyStatus(status int) Decision {
	switch {
	case status == 429:
		return Decision{Retryable: true, Reason: ReasonRateLimit}
	case status == 402:
		return Decision{Retryable: true, Reason: ReasonCreditsExhausted}
	case retryableStatuses[status]:
		return Decision{Retryable: true, Reason: ReasonTransientStatus}
	case status >= 400 && status < 500:
		return Decision{Retryable: false, Reason: ReasonClientStatus}
	default:
		return Decision{Retryable: false, Reason: ReasonOK}
	}
}

// ClassifyError maps transport failures to a retry decision. Go network
// errors are mapped from net.Error timeouts and the syscall/errno equivalents
// of the Node connection error codes (ECONNRESET, ECONNREFUSED, ENOTFOUND,
// EAI_AGAIN).
func ClassifyError(err error) Decision {
	if err == nil {
		return Decision{Retryable: false, Reason: ReasonUnknownError}
	}
	var netErr net.Error
	if errorsAs(err, &netErr) && netErr.Timeout() {
		return Decision{Retryable: true, Reason: ReasonTimeout}
	}
	if strings.Contains(err.Error(), "context deadline exceeded") || strings.Contains(err.Error(), "timeout") {
		return Decision{Retryable: true, Reason: ReasonTimeout}
	}
	if isConnectionError(err) {
		return Decision{Retryable: true, Reason: ReasonConnectionError}
	}
	if urlErr, ok := err.(*url.Error); ok {
		return ClassifyError(urlErr.Unwrap())
	}
	return Decision{Retryable: false, Reason: ReasonUnknownError}
}

func errorsAs(err error, target any) bool {
	for err != nil {
		if e, ok := err.(net.Error); ok {
			if n, ok2 := target.(*net.Error); ok2 {
				*n = e
				return true
			}
		}
		u, ok := err.(*url.Error)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}

func isConnectionError(err error) bool {
	var dnsErr *net.DNSError
	if errorsAsType(err, &dnsErr) {
		return dnsErr.IsNotFound || dnsErr.IsTemporary
	}
	var opErr *net.OpError
	if errorsAsType(err, &opErr) {
		var errno syscall.Errno
		if errorsAsType(opErr.Err, &errno) {
			switch errno {
			case syscall.ECONNRESET, syscall.ECONNREFUSED, syscall.EHOSTUNREACH, syscall.ENETUNREACH:
				return true
			}
		}
	}
	msg := strings.ToLower(err.Error())
	for _, marker := range []string{"connection reset", "connection refused", "no such host", "broken pipe"} {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}

func errorsAsType[T any](err error, target *T) bool {
	for err != nil {
		if e, ok := err.(T); ok {
			*target = e
			return true
		}
		u, ok := err.(*url.Error)
		if !ok {
			op, ok2 := err.(*net.OpError)
			if ok2 {
				if e, ok3 := op.Err.(T); ok3 {
					*target = e
					return true
				}
				err = op.Err
				continue
			}
			return false
		}
		err = u.Unwrap()
	}
	return false
}

// ParseRetryAfterSeconds handles both delay-seconds and HTTP-date forms,
// returning milliseconds like the TypeScript parseRetryAfterMs.
func ParseRetryAfterMs(value string) (int64, bool) {
	if value == "" {
		return 0, false
	}
	if seconds, err := time.ParseDuration(strings.TrimSpace(value) + "s"); err == nil && seconds >= 0 && seconds < math.MaxInt64 {
		return clampRetryAfterMs(seconds.Milliseconds()), true
	}
	var seconds int64
	if _, err := fmt.Sscanf(strings.TrimSpace(value), "%d", &seconds); err == nil && seconds >= 0 {
		// Guard the ms multiply: values beyond the cap mean "forever".
		if seconds > maxRetryAfterMs/1000 {
			return maxRetryAfterMs, true
		}
		return seconds * 1000, true
	}
	if date, err := httpDate(value); err == nil {
		delta := time.Until(date).Milliseconds()
		if delta < 0 {
			delta = 0
		}
		return delta, true
	}
	return 0, false
}

// maxRetryAfterMs caps the parsed delay at ~100 years: larger values mean
// "effectively forever" and must not overflow the cooldown arithmetic.
const maxRetryAfterMs = int64(100*365*24*3600) * 1000

// clampRetryAfterMs keeps the millisecond delay inside the representable
// range so cooldown deadlines cannot wrap to the past.
func clampRetryAfterMs(ms int64) int64 {
	if ms < 0 {
		return 0
	}
	if ms > maxRetryAfterMs {
		return maxRetryAfterMs
	}
	return ms
}

func httpDate(value string) (time.Time, error) {
	return time.Parse("Mon, 02 Jan 2006 15:04:05 GMT", value)
}

// BackoffMs mirrors retryBackoffMs: clamped index into the backoff table.
func BackoffMs(backoffs []int64, attemptIndex int) int64 {
	if len(backoffs) == 0 {
		return 0
	}
	idx := attemptIndex
	if idx > len(backoffs)-1 {
		idx = len(backoffs) - 1
	}
	if idx < 0 {
		idx = 0
	}
	return backoffs[idx]
}
