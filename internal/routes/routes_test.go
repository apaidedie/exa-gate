package routes

import "testing"

func TestCleanPath(t *testing.T) {
	if got := CleanPath(""); got != "/" {
		t.Errorf("CleanPath(\"\") = %q, want \"/\"", got)
	}
	if got := CleanPath("/search"); got != "/search" {
		t.Errorf("CleanPath(\"/search\") = %q", got)
	}
}

func TestIsAllowedPath(t *testing.T) {
	cases := []struct {
		name     string
		path     string
		patterns []string
		want     bool
	}{
		{"catch-all", "/anything/here", []string{"/**"}, true},
		{"prefix matches prefix itself", "/v0", []string{"/v0/**"}, true},
		{"prefix matches child", "/v0/websets", []string{"/v0/**"}, true},
		{"prefix does not match sibling", "/v0x", []string{"/v0/**"}, false},
		{"exact match", "/search", []string{"/search"}, true},
		{"exact does not match child", "/search/x", []string{"/search"}, false},
		{"second pattern wins", "/answer", []string{"/search", "/answer"}, true},
		{"no match", "/unknown", []string{"/search", "/v0/**"}, false},
		{"empty path allowed by catch-all", "/", []string{"/**"}, true},
	}
	for _, c := range cases {
		if got := IsAllowedPath(c.path, c.patterns); got != c.want {
			t.Errorf("%s: IsAllowedPath(%q) = %v, want %v", c.name, c.path, got, c.want)
		}
	}
}

func TestIsRetrySafe(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		path    string
		headers HeaderBag
		want    bool
	}{
		{"GET always safe", "GET", "/anything", nil, true},
		{"HEAD always safe", "HEAD", "/anything", nil, true},
		{"OPTIONS always safe", "OPTIONS", "/anything", nil, true},
		{"lowercase get", "get", "/anything", nil, true},
		{"POST search", "POST", "/search", nil, true},
		{"POST contents", "POST", "/contents", nil, true},
		{"POST answer", "POST", "/answer", nil, true},
		{"POST findSimilar", "POST", "/findSimilar", nil, true},
		{"POST monitors", "POST", "/monitors", nil, true},
		{"POST websets preview", "POST", "/v0/websets/preview", nil, true},
		{"POST cancel suffix", "POST", "/agent/runs/abc/cancel", nil, true},
		{"POST monitor trigger", "POST", "/monitors/m1/trigger", nil, true},
		{"POST monitors batch", "POST", "/monitors/batch", nil, true},
		{"POST unknown path", "POST", "/agent/runs", nil, false},
		{"DELETE unknown path", "DELETE", "/search", nil, false},
		{"POST with idempotency key", "POST", "/agent/runs", HeaderBag{"Idempotency-Key": "abc"}, true},
		{"POST with lowercase idempotency key", "POST", "/anything", HeaderBag{"idempotency-key": "abc"}, true},
		{"POST with empty idempotency key", "POST", "/anything", HeaderBag{"idempotency-key": ""}, false},
		{"POST root path", "POST", "/", nil, false},
	}
	for _, c := range cases {
		if got := IsRetrySafe(c.method, c.path, c.headers); got != c.want {
			t.Errorf("%s: IsRetrySafe(%q, %q) = %v, want %v", c.name, c.method, c.path, got, c.want)
		}
	}
}

func TestIsResourceCreatingPath(t *testing.T) {
	creating := []string{
		"/agent/runs", "/research/v1", "/monitors",
		"/v0/websets", "/v0/webhooks", "/v0/imports", "/batches",
		"/v0/websets/w1/enrichments", "/v0/websets/w1/items", "/v0/websets/w1/searches",
	}
	for _, p := range creating {
		if !IsResourceCreatingPath(p) {
			t.Errorf("IsResourceCreatingPath(%q) = false, want true", p)
		}
	}
	notCreating := []string{"/search", "/v0/websets/w1/other", "/v0/websets/w1", "/"}
	for _, p := range notCreating {
		if IsResourceCreatingPath(p) {
			t.Errorf("IsResourceCreatingPath(%q) = true, want false", p)
		}
	}
}

func TestParseResourceAffinity(t *testing.T) {
	cases := []struct {
		path     string
		wantType string
		wantID   string
		want     bool
	}{
		{"/agent/runs/run123", "agent_run", "run123", true},
		{"/research/v1/r9", "research", "r9", true},
		{"/monitors/m1", "monitor", "m1", true},
		{"/v0/websets/w1", "webset", "w1", true},
		{"/v0/webhooks/h1", "webhook", "h1", true},
		{"/v0/imports/i1", "import", "i1", true},
		{"/batches/b1", "batch", "b1", true},
		{"/search", "", "", false},
		{"/v0/websets", "", "", false},
		{"/", "", "", false},
		{"", "", "", false},
	}
	for _, c := range cases {
		got, ok := ParseResourceAffinity(c.path)
		if ok != c.want || got.Type != c.wantType || got.ID != c.wantID {
			t.Errorf("ParseResourceAffinity(%q) = {%s %s} %v, want {%s %s} %v", c.path, got.Type, got.ID, ok, c.wantType, c.wantID, c.want)
		}
	}
}

func TestCreatedResourceFromResponse(t *testing.T) {
	body := map[string]any{"id": "abc123"}
	cases := []struct {
		name     string
		path     string
		body     map[string]any
		method   string
		wantType string
		wantID   string
		want     bool
	}{
		{"POST /agent/runs prefers id", "/agent/runs", map[string]any{"id": "r1", "runId": "r2"}, "POST", "agent_run", "r1", true},
		{"POST /agent/runs falls back to runId", "/agent/runs", map[string]any{"runId": "r2"}, "POST", "agent_run", "r2", true},
		{"POST /research/v1", "/research/v1", map[string]any{"researchId": "rr"}, "POST", "research", "rr", true},
		{"POST /monitors", "/monitors", map[string]any{"monitorId": "m"}, "POST", "monitor", "m", true},
		{"POST /v0/websets", "/v0/websets", map[string]any{"id": "w"}, "POST", "webset", "w", true},
		{"POST /v0/webhooks", "/v0/webhooks", map[string]any{"id": "h"}, "POST", "webhook", "h", true},
		{"POST /v0/imports", "/v0/imports", map[string]any{"id": "i"}, "POST", "import", "i", true},
		{"POST /batches", "/batches", map[string]any{"id": "b"}, "POST", "batch", "b", true},
		{"POST webset subresource binds to parent webset", "/v0/websets/w1/items", map[string]any{"id": "item9"}, "POST", "webset", "w1", true},
		{"GET never creates affinity", "/agent/runs", body, "GET", "", "", false},
		{"empty id ignored", "/agent/runs", map[string]any{"id": ""}, "POST", "", "", false},
		{"nil body", "/agent/runs", nil, "POST", "", "", false},
		{"unknown path", "/unknown", body, "POST", "", "", false},
		{"root path", "/", body, "POST", "", "", false},
	}
	for _, c := range cases {
		got, ok := CreatedResourceFromResponse(c.method, c.path, c.body)
		if ok != c.want || got.Type != c.wantType || got.ID != c.wantID {
			t.Errorf("CreatedResourceFromResponse(%q, %q) = {%s %s} %v, want {%s %s} %v", c.method, c.path, got.Type, got.ID, ok, c.wantType, c.wantID, c.want)
		}
	}
}
