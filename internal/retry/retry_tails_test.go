package retry

import (
	"errors"
	"net"
	"net/url"
	"testing"
)

func TestErrorsAsHelpers(t *testing.T) {
	var netErr net.Error
	// nil error: the loop never runs, returns false.
	if errorsAs(nil, &netErr) {
		t.Error("errorsAs(nil) = true")
	}
	// A plain error that never unwraps into a net.Error.
	if errorsAs(errors.New("plain"), &netErr) {
		t.Error("errorsAs(plain) = true")
	}
	// A url.Error chain hiding a timeout is found.
	wrapped := &url.Error{Op: "Post", Err: timeoutError{}}
	if !errorsAs(wrapped, &netErr) {
		t.Error("errorsAs(url.Error{timeout}) = false")
	}
	if !netErr.Timeout() {
		t.Error("unwrapped net.Error lost its Timeout flag")
	}

	var dnsErr *net.DNSError
	// Mismatched type through the chain: false.
	if errorsAsType(wrapped, &dnsErr) {
		t.Error("errorsAsType(url.Error{timeout}, DNSError) = true")
	}
	// OpError whose Err does not match continues unwrapping and returns false.
	op := &net.OpError{Op: "dial", Err: errors.New("plain")}
	if errorsAsType(op, &dnsErr) {
		t.Error("errorsAsType(OpError{plain}, DNSError) = true")
	}
	// OpError whose Err matches directly: true.
	if !errorsAsType(&net.OpError{Err: &net.DNSError{IsNotFound: true}}, &dnsErr) {
		t.Error("errorsAsType(OpError{DNSError}, DNSError) = false")
	}
	if dnsErr == nil || !dnsErr.IsNotFound {
		t.Error("target not populated")
	}
	// Deep chain: url.Error wrapping OpError wrapping DNSError.
	deep := &url.Error{Err: &net.OpError{Err: &net.DNSError{IsTemporary: true}}}
	var found *net.DNSError
	if !errorsAsType(deep, &found) {
		t.Error("errorsAsType(deep chain) = false")
	}
}

func TestParseRetryAfterLenientSeconds(t *testing.T) {
	// Non-duration suffix falls through to the integer parse: "5x" -> 5s.
	ms, ok := ParseRetryAfterMs("5x")
	if !ok || ms != 5000 {
		t.Errorf("ParseRetryAfterMs(\"5x\") = (%d, %v), want (5000, true)", ms, ok)
	}
	// Huge values saturate instead of overflowing.
	ms, ok = ParseRetryAfterMs("99999999999999999")
	if !ok {
		t.Error("huge seconds should parse via Sscanf")
	}
}
