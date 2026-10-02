package proxy

import (
	"net/http"
	"strings"
)

// Small indirection helpers so proxy.go stays framework-free while sharing
// the retry/routes/keycrypt packages.

var hopByHop = map[string]bool{
	"connection": true, "keep-alive": true, "proxy-authenticate": true,
	"proxy-authorization": true, "te": true, "trailer": true,
	"transfer-encoding": true, "upgrade": true,
}

func retryClassifyStatus(status int) string { return classifyStatusFn(status) }

func retryClassifyError(err error) string { return classifyErrorFn(err) }

func retryable(reason string) bool { return reason == "rate_limit" || reason == "credits_exhausted" || reason == "transient_status" || reason == "timeout" || reason == "connection_error" }

func backoffMs(backoffs []int64, attemptIndex int) int64 { return backoffFn(backoffs, attemptIndex) }

func parseRetryAfter(value string) (int64, bool) { return parseRetryAfterFn(value) }

func routesIsAllowedPath(pathname string, allowedPaths []string) bool { return allowedFn(pathname, allowedPaths) }

func routesIsRetrySafe(method string, pathname string, headers HeaderBag) bool {
	return retrySafeFn(method, pathname, headerMapToStrings(headers))
}

func routesIsResourceCreatingPath(pathname string) bool { return resourceCreatingFn(pathname) }

func routesParseResourceAffinity(pathname string) (routesAffinity, bool) { return affinityFn(pathname) }

func routesCreatedResourceFromResponse(method string, pathname string, body map[string]any) (routesAffinity, bool) {
	return createdFn(method, pathname, body)
}

func headerBag(r *http.Request) HeaderBag {
	bag := HeaderBag{}
	for name, values := range r.Header {
		if len(values) > 0 {
			bag[name] = values[0]
		}
	}
	return bag
}

func headerMapToStrings(bag HeaderBag) map[string]string {
	out := map[string]string{}
	for name, value := range bag {
		out[name] = value
	}
	return out
}

func upstreamHeaders(r *http.Request, upstreamKey string, requestID string) map[string]string {
	headers := map[string]string{}
	for name, values := range r.Header {
		lower := strings.ToLower(name)
		if hopByHop[lower] || lower == "authorization" || lower == "x-api-key" || lower == "x-proxy-api-key" || lower == "host" || lower == "content-length" {
			continue
		}
		if len(values) > 0 {
			headers[lower] = values[0]
		}
	}
	headers["x-api-key"] = upstreamKey
	headers["x-request-id"] = requestID
	return headers
}

func extractToken(authHeader, proxyKeyHeader string) string { return extractTokenFn(authHeader, proxyKeyHeader) }

func isAuthorized(presented string, allowed []string) bool { return authorizedFn(presented, allowed) }

func tokenIDFor(presented string, allowed []string) string { return tokenIDFn(presented, allowed) }

func metricsRecordCacheHit()                                { cacheHitFn() }
func metricsRecordCacheMiss()                               { cacheMissFn() }
func metricsRecordLatency(path string, statusGroup string, ms int64) { latencyFn(path, statusGroup, ms) }
func metricsRecordStatus(status int64)                      { statusFn(status) }
