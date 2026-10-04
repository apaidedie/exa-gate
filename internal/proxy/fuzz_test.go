package proxy

import "testing"

func FuzzExtractQuery(f *testing.F) {
	f.Add([]byte(`{"query":"test"}`))
	f.Add([]byte(`{}`))
	f.Add([]byte(`not json`))
	f.Add([]byte(nil))
	f.Add([]byte(`{"query":"` + string(make([]byte, 300, 300)) + `"}`))
	f.Fuzz(func(t *testing.T, body []byte) {
		got := extractQuery(body)
		if got != nil && len(*got) > 200 {
			t.Fatalf("query not truncated: %d bytes", len(*got))
		}
	})
}

func FuzzParseRetryAfterHeader(f *testing.F) {
	f.Add("30")
	f.Add("Mon, 02 Jan 2006 15:04:05 GMT")
	f.Add("junk")
	f.Add("-1")
	f.Fuzz(func(t *testing.T, value string) {
		ms, ok := parseRetryAfter(value)
		if ok && ms < 0 {
			t.Fatalf("negative retry-after: %d", ms)
		}
	})
}
