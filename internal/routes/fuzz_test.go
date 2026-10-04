package routes

import "testing"

func FuzzIsAllowedPath(f *testing.F) {
	f.Add("/search", "/**")
	f.Add("/v0/websets/w1", "/v0/**,/search")
	f.Add("", "/search")
	f.Add("/", "/**")
	f.Add("/v0x", "/v0/**")
	f.Fuzz(func(t *testing.T, path, patterns string) {
		list := splitCSVHelper(patterns)
		_ = IsAllowedPath(path, list)
		_ = CleanPath(path)
		_ = IsResourceCreatingPath(path)
		if _, ok := ParseResourceAffinity(path); ok {
			// ok is fine; the invariant is simply "no panic".
		}
	})
}

func FuzzIsRetrySafe(f *testing.F) {
	f.Add("POST", "/search", "idempotency-key=abc")
	f.Add("get", "/", "")
	f.Add("DELETE", "/monitors/m1/trigger", "")
	f.Fuzz(func(t *testing.T, method, path, headers string) {
		bag := HeaderBag{}
		if headers != "" {
			bag["Idempotency-Key"] = headers
		}
		_ = IsRetrySafe(method, path, bag)
	})
}

// splitCSVHelper mirrors the config-side splitting so the fuzz target can
// exercise multi-pattern allowlists.
func splitCSVHelper(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			if part := s[start:i]; part != "" {
				out = append(out, part)
			}
			start = i + 1
		}
	}
	return out
}
