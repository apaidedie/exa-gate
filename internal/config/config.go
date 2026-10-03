// Package config ports the TypeScript environment parsing with identical
// variable names and defaults.
package config

import (
	"os"
	"strconv"
	"strings"
)

type Strategy string

const (
	StrategyRoundRobin         Strategy = "round_robin"
	StrategyWeightedRoundRobin Strategy = "weighted_round_robin"
	StrategyLRU                Strategy = "least_recently_used"
	StrategyAdaptiveWeighted   Strategy = "adaptive_weighted"
)

type KeySeed struct {
	ID      string
	Value   string
	Weight  int
	Enabled bool
}

type Config struct {
	Host                            string
	Port                            int
	UpstreamURL                     string
	Keys                            []KeySeed
	EncryptionSecret                string
	LegacyEncryptionSecret          string
	ProxyTokens                     []string
	AdminTokens                     []string
	StatePath                       string
	SelectionStrategy               Strategy
	MaxAttempts                     int
	AttemptTimeoutMs                int64
	RetryBackoffMs                  []int64
	FailureThreshold                int
	FailureWindowSeconds            int64
	CooldownSeconds                 int64
	RateLimitCooldownSeconds        int64
	CreditsExhaustedCooldownSeconds int64
	MaxBodyBytes                    int64
	AllowedPaths                    []string
	ResourceAffinity                bool
	LogLevel                        string
	AdminSessionTTLSeconds          int64
	AdminLockoutMaxFailures         int
	AdminLockoutWindowSeconds       int64
	AdminLockoutSeconds             int64
	AdminRequireHTTPS               bool
	AllowRawKeyDisplay              bool
	VersionCheckEnabled             bool
	LogRetentionDays                int
	AlertAvailableKeyMin            int
	AlertFailureRatePercent         float64
	AlertRateLimitRatePercent       float64
	AlertWebhookURL                 string
	AlertWebhookBearerToken         string
	AlertWebhookCooldownSeconds     int64
	AlertWebhookHMACSecret          string
	AlertWebhookMaxAttempts         int
	AlertWebhookRetryBackoffMs      int64
	TrendWindowHours                int
	TrustProxy                      bool
	UpstreamAllowH2                 bool
	SearchCacheTTLSeconds           int64
	UpstreamPoolConnections         int
	AffinityRetentionDays           int
	ProxyRateLimitPerMinute         int
}

func env(key string) string { return os.Getenv(key) }

func number(key string, def int64) int64 {
	if value := strings.TrimSpace(env(key)); value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
			return parsed
		}
	}
	return def
}

func numberList(key string, def []int64) []int64 {
	value := strings.TrimSpace(env(key))
	if value == "" {
		return def
	}
	var out []int64
	for _, part := range strings.Split(value, ",") {
		if parsed, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil {
			out = append(out, parsed)
		}
	}
	if len(out) == 0 {
		return def
	}
	return out
}

func splitCSV(key string) []string {
	value := strings.TrimSpace(env(key))
	if value == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func parseStrategy(value string) Strategy {
	switch Strategy(value) {
	case StrategyRoundRobin, StrategyLRU, StrategyAdaptiveWeighted:
		return Strategy(value)
	default:
		return StrategyWeightedRoundRobin
	}
}

// ParseKeySeeds supports "id:key:weight" pairs in EXA_KEYS. Bare values get
// auto ids and weight 1.
func ParseKeySeeds(raw string) []KeySeed {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var keys []KeySeed
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		keys = append(keys, parseKeySeedEntry(entry, len(keys)+1))
	}
	return keys
}

func parseKeySeedEntry(entry string, autoID int) KeySeed {
	parts := strings.Split(entry, ":")
	switch len(parts) {
	case 1:
		return KeySeed{ID: "key_" + strconv.Itoa(autoID), Value: parts[0], Weight: 1, Enabled: true}
	case 3:
		weight := 1
		if parsed, err := strconv.Atoi(parts[2]); err == nil && parsed >= 1 {
			weight = parsed
		}
		return KeySeed{ID: parts[0], Value: parts[1], Weight: weight, Enabled: true}
	default:
		// value contains colons (rare); treat everything after the first
		// segment as the value.
		return KeySeed{ID: parts[0], Value: strings.Join(parts[1:], ":"), Weight: 1, Enabled: true}
	}
}

// parseKeySeedsFile parses EXA_KEYS_FILE content, which is line-oriented —
// one entry per line, CRLF tolerated — unlike the comma-separated EXA_KEYS.
// This matches the TypeScript loader's parseKeysFile semantics.
func parseKeySeedsFile(content string, startID int) []KeySeed {
	if strings.TrimSpace(content) == "" {
		return nil
	}
	var keys []KeySeed
	for _, line := range strings.Split(content, "\n") {
		entry := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
		if entry == "" {
			continue
		}
		keys = append(keys, parseKeySeedEntry(entry, startID+len(keys)+1))
	}
	return keys
}

func Load() Config {
	proxyTokens := splitCSV("EXA_PROXY_TOKENS")
	adminTokens := splitCSV("EXA_ADMIN_TOKENS")
	seedKeys := ParseKeySeeds(env("EXA_KEYS"))
	keys := seedKeys
	if fileKeys := env("EXA_KEYS_FILE"); fileKeys != "" {
		if content, err := os.ReadFile(fileKeys); err == nil {
			keys = append(keys, parseKeySeedsFile(string(content), len(keys))...)
		}
	}

	upstreamURL := strings.TrimRight(env("EXA_UPSTREAM_URL"), "/")
	if upstreamURL == "" {
		upstreamURL = "https://api.exa.ai"
	}

	allowedPaths := splitCSV("EXA_ALLOWED_PATHS")
	if len(allowedPaths) == 0 {
		allowedPaths = []string{"/**"}
	}

	encryptionSecret := env("EXA_KEYS_ENCRYPTION_SECRET")
	if len(encryptionSecret) < 16 {
		// Mirror the TypeScript contract: fail fast when the encryption secret
		// is missing or too short. Callers surface the error at boot.
		encryptionSecret = "" // validated by Validate()
	}

	trustProxyRaw := env("EXA_TRUST_PROXY")
	trustProxy := false
	switch trustProxyRaw {
	case "true":
		trustProxy = true
	case "false", "":
		trustProxy = false
	default:
		trustProxy = trustProxyRaw != ""
	}

	return Config{
		Host:                            orDefault(env("HOST"), "0.0.0.0"),
		Port:                            int(number("PORT", 8787)),
		UpstreamURL:                     upstreamURL,
		Keys:                            keys,
		EncryptionSecret:                encryptionSecret,
		LegacyEncryptionSecret:          env("EXA_KEYS_ENCRYPTION_SECRET_LEGACY"),
		ProxyTokens:                     proxyTokens,
		AdminTokens:                     adminTokens,
		StatePath:                       orDefault(env("EXA_STATE_PATH"), "./exa-proxy.sqlite"),
		SelectionStrategy:               parseStrategy(env("EXA_SELECTION_STRATEGY")),
		MaxAttempts:                     int(number("EXA_MAX_ATTEMPTS", 3)),
		AttemptTimeoutMs:                number("EXA_ATTEMPT_TIMEOUT_MS", 30000),
		RetryBackoffMs:                  numberList("EXA_RETRY_BACKOFF_MS", []int64{200, 600, 1500}),
		FailureThreshold:                int(number("EXA_FAILURE_THRESHOLD", 3)),
		FailureWindowSeconds:            number("EXA_FAILURE_WINDOW_SECONDS", 60),
		CooldownSeconds:                 number("EXA_COOLDOWN_SECONDS", 120),
		RateLimitCooldownSeconds:        number("EXA_RATE_LIMIT_COOLDOWN_SECONDS", 300),
		CreditsExhaustedCooldownSeconds: number("EXA_CREDITS_EXHAUSTED_COOLDOWN_SECONDS", 600),
		MaxBodyBytes:                    number("EXA_MAX_BODY_BYTES", 20971520),
		AllowedPaths:                    allowedPaths,
		ResourceAffinity:                env("EXA_RESOURCE_AFFINITY") != "false",
		LogLevel:                        orDefault(env("LOG_LEVEL"), "info"),
		AdminSessionTTLSeconds:          number("EXA_ADMIN_SESSION_TTL_SECONDS", 604800),
		AdminLockoutMaxFailures:         int(number("EXA_ADMIN_LOCKOUT_MAX_FAILURES", 5)),
		AdminLockoutWindowSeconds:       number("EXA_ADMIN_LOCKOUT_WINDOW_SECONDS", 300),
		AdminLockoutSeconds:             number("EXA_ADMIN_LOCKOUT_SECONDS", 900),
		AdminRequireHTTPS:               env("EXA_ADMIN_REQUIRE_HTTPS") == "true",
		AllowRawKeyDisplay:              env("EXA_ADMIN_ALLOW_RAW_KEY_DISPLAY") != "false",
		VersionCheckEnabled:             env("EXA_VERSION_CHECK") != "false",
		LogRetentionDays:                int(number("EXA_LOG_RETENTION_DAYS", 14)),
		AlertAvailableKeyMin:            int(number("EXA_ALERT_AVAILABLE_KEY_MIN", 1)),
		AlertFailureRatePercent:         float64(number("EXA_ALERT_FAILURE_RATE_PERCENT", 10)),
		AlertRateLimitRatePercent:       float64(number("EXA_ALERT_RATE_LIMIT_RATE_PERCENT", 20)),
		AlertWebhookURL:                 env("EXA_ALERT_WEBHOOK_URL"),
		AlertWebhookBearerToken:         env("EXA_ALERT_WEBHOOK_BEARER_TOKEN"),
		AlertWebhookCooldownSeconds:     number("EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS", 300),
		AlertWebhookHMACSecret:          env("EXA_ALERT_WEBHOOK_HMAC_SECRET"),
		AlertWebhookMaxAttempts:         intMax(1, int(number("EXA_ALERT_WEBHOOK_MAX_ATTEMPTS", 1))),
		AlertWebhookRetryBackoffMs:      number("EXA_ALERT_WEBHOOK_RETRY_BACKOFF_MS", 250),
		TrendWindowHours:                int(number("EXA_TREND_WINDOW_HOURS", 24)),
		TrustProxy:                      trustProxy,
		UpstreamAllowH2:                 env("EXA_UPSTREAM_ALLOW_H2") != "false",
		SearchCacheTTLSeconds:           number("EXA_SEARCH_CACHE_TTL", 0),
		UpstreamPoolConnections:         int(number("EXA_UPSTREAM_POOL_CONNECTIONS", 128)),
		AffinityRetentionDays:           int(number("EXA_AFFINITY_RETENTION_DAYS", 7)),
		ProxyRateLimitPerMinute:         int(number("EXA_PROXY_RATE_LIMIT_PER_MINUTE", 0)),
	}
}

// Validate enforces the boot-time contract (encryption secret required).
func (c *Config) Validate() error {
	if len(c.EncryptionSecret) < 16 {
		return errSecretRequired
	}
	return nil
}

func intMax(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func orDefault(value, def string) string {
	if value == "" {
		return def
	}
	return value
}
