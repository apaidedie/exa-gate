// Package routes ports the path policy logic: allowlist, retry-safe
// classification and resource-affinity parsing, byte-for-byte compatible
// with the TypeScript implementation.
package routes

import (
	"strings"
)

type HeaderBag map[string]string

type ResourceAffinity struct {
	Type string
	ID   string
}

func CleanPath(pathname string) string {
	if pathname == "" {
		return "/"
	}
	return pathname
}

func IsAllowedPath(pathname string, allowedPaths []string) bool {
	path := CleanPath(pathname)
	for _, pattern := range allowedPaths {
		if pattern == "/**" {
			return true
		}
		if strings.HasSuffix(pattern, "/**") {
			prefix := pattern[:len(pattern)-3]
			if path == prefix || strings.HasPrefix(path, pattern[:len(pattern)-2]) {
				return true
			}
			continue
		}
		if path == pattern {
			return true
		}
	}
	return false
}

func hasIdempotencyKey(headers HeaderBag) bool {
	for name, value := range headers {
		if strings.EqualFold(name, "idempotency-key") && value != "" {
			return true
		}
	}
	return false
}

var retrySafePostPaths = map[string]bool{
	"/search": true, "/contents": true, "/answer": true, "/findSimilar": true,
	"/monitors": true, "/v0/websets/preview": true,
}

func isRetrySafePostPath(pathname string) bool {
	if retrySafePostPaths[pathname] {
		return true
	}
	parts := splitSegments(pathname)
	if len(parts) == 0 {
		return false
	}
	if strings.HasSuffix(pathname, "/cancel") {
		return true
	}
	if parts[0] == "monitors" && len(parts) > 2 && parts[2] == "trigger" {
		return true
	}
	if parts[0] == "monitors" && len(parts) > 1 && parts[1] == "batch" {
		return true
	}
	return false
}

func splitSegments(pathname string) []string {
	raw := strings.Split(pathname, "/")
	parts := make([]string, 0, len(raw))
	for _, part := range raw {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return parts
}

func IsRetrySafe(method string, pathname string, headers HeaderBag) bool {
	normalized := strings.ToUpper(method)
	switch normalized {
	case "GET", "HEAD", "OPTIONS":
		return true
	case "POST":
		if isRetrySafePostPath(pathname) {
			return true
		}
	}
	return hasIdempotencyKey(headers)
}

// IsResourceCreatingPath reports POST paths that may create a resource whose
// id should be recorded for affinity.
func IsResourceCreatingPath(pathname string) bool {
	if pathname == "/agent/runs" || pathname == "/research/v1" || pathname == "/monitors" ||
		pathname == "/v0/websets" || pathname == "/v0/webhooks" || pathname == "/v0/imports" ||
		pathname == "/batches" {
		return true
	}
	parts := splitSegments(pathname)
	if len(parts) > 0 && parts[0] == "v0" && len(parts) == 4 && parts[1] == "websets" && parts[2] != "" &&
		(parts[3] == "enrichments" || parts[3] == "items" || parts[3] == "searches") {
		return true
	}
	return false
}

func ParseResourceAffinity(pathname string) (ResourceAffinity, bool) {
	parts := splitSegments(pathname)
	if len(parts) == 0 {
		return ResourceAffinity{}, false
	}
	switch {
	case parts[0] == "agent" && len(parts) > 2 && parts[1] == "runs":
		return ResourceAffinity{Type: "agent_run", ID: parts[2]}, true
	case parts[0] == "research" && len(parts) > 2 && parts[1] == "v1":
		return ResourceAffinity{Type: "research", ID: parts[2]}, true
	case parts[0] == "monitors" && len(parts) > 1:
		return ResourceAffinity{Type: "monitor", ID: parts[1]}, true
	case parts[0] == "v0" && len(parts) > 2 && parts[1] == "websets":
		return ResourceAffinity{Type: "webset", ID: parts[2]}, true
	case parts[0] == "v0" && len(parts) > 2 && parts[1] == "webhooks":
		return ResourceAffinity{Type: "webhook", ID: parts[2]}, true
	case parts[0] == "v0" && len(parts) > 2 && parts[1] == "imports":
		return ResourceAffinity{Type: "import", ID: parts[2]}, true
	case parts[0] == "batches" && len(parts) > 1:
		return ResourceAffinity{Type: "batch", ID: parts[1]}, true
	}
	return ResourceAffinity{}, false
}

// CreatedResourceFromResponse extracts the created resource id from a JSON
// response body (already decoded into a map) for affinity bookkeeping.
func CreatedResourceFromResponse(method string, pathname string, body map[string]any) (ResourceAffinity, bool) {
	if !strings.EqualFold(method, "POST") || body == nil {
		return ResourceAffinity{}, false
	}
	stringField := func(names ...string) (string, bool) {
		for _, name := range names {
			if value, ok := body[name].(string); ok && value != "" {
				return value, true
			}
		}
		return "", false
	}
	idFor := func(kind string, names ...string) (ResourceAffinity, bool) {
		if id, ok := stringField(names...); ok {
			return ResourceAffinity{Type: kind, ID: id}, true
		}
		return ResourceAffinity{}, false
	}
	switch pathname {
	case "/agent/runs":
		return idFor("agent_run", "id", "runId")
	case "/research/v1":
		return idFor("research", "id", "researchId")
	case "/monitors":
		return idFor("monitor", "id", "monitorId")
	case "/v0/websets":
		return idFor("webset", "id", "websetId")
	case "/v0/webhooks":
		return idFor("webhook", "id", "webhookId")
	case "/v0/imports":
		return idFor("import", "id", "importId")
	case "/batches":
		return idFor("batch", "id", "batchId")
	}
	parts := splitSegments(pathname)
	if len(parts) > 0 && parts[0] == "v0" && len(parts) == 4 && parts[1] == "websets" && parts[2] != "" &&
		(parts[3] == "enrichments" || parts[3] == "items" || parts[3] == "searches") {
		return ResourceAffinity{Type: "webset", ID: parts[2]}, true
	}
	return ResourceAffinity{}, false
}
