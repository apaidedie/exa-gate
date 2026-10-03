package proxy

import (
	"github.com/apaidedie/exa-gate/internal/keycrypt"
	"github.com/apaidedie/exa-gate/internal/metrics"
	"github.com/apaidedie/exa-gate/internal/retry"
	"github.com/apaidedie/exa-gate/internal/routes"
)

var (
	classifyStatusFn   = func(status int) string { return string(retry.ClassifyStatus(status).Reason) }
	classifyErrorFn    = func(err error) string { return string(retry.ClassifyError(err).Reason) }
	backoffFn          = retry.BackoffMs
	parseRetryAfterFn  = retry.ParseRetryAfterMs
	allowedFn          = routes.IsAllowedPath
	retrySafeFn        = routes.IsRetrySafe
	resourceCreatingFn = routes.IsResourceCreatingPath
	affinityFn         = routes.ParseResourceAffinity
	createdFn          = routes.CreatedResourceFromResponse
	extractTokenFn     = keycrypt.ExtractToken
	authorizedFn       = keycrypt.IsAuthorized
	tokenIDFn          = keycrypt.TokenIDForPresented
	cacheHitFn         = metrics.RecordCacheHit
	cacheMissFn        = metrics.RecordCacheMiss
	latencyFn          = metrics.RecordRequestLatencyMs
	statusFn           = metrics.RecordRequestStatus
)

type HeaderBag = map[string]string
type routesAffinity = routes.ResourceAffinity
