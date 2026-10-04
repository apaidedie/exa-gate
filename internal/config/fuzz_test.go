package config

import "testing"

func FuzzParseKeySeeds(f *testing.F) {
	f.Add("k1:v1:3, plainkey")
	f.Add("")
	f.Add("a:b:c:d")
	f.Add(",,,")
	f.Add("k:")
	f.Fuzz(func(t *testing.T, raw string) {
		keys := ParseKeySeeds(raw)
		for i, key := range keys {
			if key.ID == "" {
				t.Fatalf("entry %d has empty id: %+v", i, key)
			}
			if key.Weight < 1 {
				t.Fatalf("entry %d weight below 1: %+v", i, key)
			}
		}
	})
}

func FuzzParseKeySeedsFile(f *testing.F) {
	f.Add("line1\nline2:lv:2\n")
	f.Add("")
	f.Add("\r\n\r\n")
	f.Add("a:b:c:d\r\n")
	f.Fuzz(func(t *testing.T, raw string) {
		keys := parseKeySeedsFile(raw, 0)
		for i, key := range keys {
			if key.ID == "" || key.Value == "" {
				t.Fatalf("entry %d incomplete: %+v", i, key)
			}
		}
	})
}
