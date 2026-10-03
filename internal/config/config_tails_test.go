package config

import "testing"

func TestParseKeySeedsFileLines(t *testing.T) {
	if got := parseKeySeedsFile("", 1); got != nil {
		t.Errorf("empty content = %+v, want nil", got)
	}
	if got := parseKeySeedsFile("   \n\t\n", 1); got != nil {
		t.Errorf("blank content = %+v, want nil", got)
	}
	// CRLF line endings and interleaved blank lines are tolerated; the auto
	// id counter continues from startID.
	got := parseKeySeedsFile("first:fv:2\r\n\r\nplain\r\n  \nthird:tv:9", 2)
	if len(got) != 3 {
		t.Fatalf("parsed = %+v, want 3 entries", got)
	}
	if got[0].ID != "first" || got[0].Value != "fv" || got[0].Weight != 2 {
		t.Errorf("entry 0 = %+v", got[0])
	}
	if got[1].ID != "key_4" || got[1].Value != "plain" || got[1].Weight != 1 {
		t.Errorf("entry 1 = %+v, want auto id key_4", got[1])
	}
	if got[2].ID != "third" || got[2].Weight != 9 {
		t.Errorf("entry 2 = %+v", got[2])
	}
}
