package retry

import "testing"

func FuzzParseRetryAfterMs(f *testing.F) {
	f.Add("30")
	f.Add("0")
	f.Add("-5")
	f.Add("abc")
	f.Add("Mon, 02 Jan 2006 15:04:05 GMT")
	f.Add("999999999999999999999999")
	f.Add(" 1.5 ")
	f.Fuzz(func(t *testing.T, value string) {
		ms, ok := ParseRetryAfterMs(value)
		if ok && ms < 0 {
			t.Fatalf("negative delay accepted: %q -> %d", value, ms)
		}
	})
}

func FuzzClassifyError(f *testing.F) {
	f.Add("connection reset by peer")
	f.Add("context deadline exceeded")
	f.Add("Client.Timeout exceeded")
	f.Add("")
	f.Fuzz(func(t *testing.T, message string) {
		d := ClassifyError(errorString(message))
		switch d.Reason {
		case ReasonOK:
			t.Fatal("errors never classify as ok")
		case ReasonRateLimit, ReasonCreditsExhausted, ReasonTransientStatus, ReasonClientStatus:
			t.Fatalf("status-only reason on error path: %v", d.Reason)
		}
	})
}

type errorString string

func (e errorString) Error() string { return string(e) }
