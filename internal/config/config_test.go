package config

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// clearExaEnv unsets every environment variable the loader reads so tests
// start from a deterministic baseline; the outer environment is restored on
// cleanup.
func clearExaEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		"HOST", "PORT", "LOG_LEVEL",
		"EXA_UPSTREAM_URL", "EXA_KEYS", "EXA_KEYS_FILE", "EXA_KEYS_ENCRYPTION_SECRET",
		"EXA_KEYS_ENCRYPTION_SECRET_LEGACY", "EXA_PROXY_TOKENS", "EXA_ADMIN_TOKENS",
		"EXA_STATE_PATH", "EXA_SELECTION_STRATEGY", "EXA_MAX_ATTEMPTS", "EXA_ATTEMPT_TIMEOUT_MS",
		"EXA_RETRY_BACKOFF_MS", "EXA_FAILURE_THRESHOLD", "EXA_FAILURE_WINDOW_SECONDS",
		"EXA_COOLDOWN_SECONDS", "EXA_RATE_LIMIT_COOLDOWN_SECONDS",
		"EXA_CREDITS_EXHAUSTED_COOLDOWN_SECONDS", "EXA_MAX_BODY_BYTES", "EXA_ALLOWED_PATHS",
		"EXA_RESOURCE_AFFINITY", "EXA_ADMIN_SESSION_TTL_SECONDS", "EXA_ADMIN_LOCKOUT_MAX_FAILURES",
		"EXA_ADMIN_LOCKOUT_WINDOW_SECONDS", "EXA_ADMIN_LOCKOUT_SECONDS", "EXA_ADMIN_REQUIRE_HTTPS",
		"EXA_ADMIN_ALLOW_RAW_KEY_DISPLAY", "EXA_VERSION_CHECK", "EXA_LOG_RETENTION_DAYS",
		"EXA_ALERT_AVAILABLE_KEY_MIN", "EXA_ALERT_FAILURE_RATE_PERCENT", "EXA_ALERT_RATE_LIMIT_RATE_PERCENT",
		"EXA_ALERT_WEBHOOK_URL", "EXA_ALERT_WEBHOOK_BEARER_TOKEN", "EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS",
		"EXA_ALERT_WEBHOOK_HMAC_SECRET", "EXA_ALERT_WEBHOOK_MAX_ATTEMPTS", "EXA_ALERT_WEBHOOK_RETRY_BACKOFF_MS",
		"EXA_TREND_WINDOW_HOURS", "EXA_TRUST_PROXY", "EXA_UPSTREAM_ALLOW_H2", "EXA_SEARCH_CACHE_TTL",
		"EXA_UPSTREAM_POOL_CONNECTIONS", "EXA_AFFINITY_RETENTION_DAYS", "EXA_PROXY_RATE_LIMIT_PER_MINUTE",
	}
	for _, key := range keys {
		if old, ok := os.LookupEnv(key); ok {
			t.Cleanup(func() { os.Setenv(key, old) })
		}
		os.Unsetenv(key)
	}
}

func TestLoadDefaults(t *testing.T) {
	clearExaEnv(t)
	c := Load()

	checks := []struct {
		name string
		fail bool
	}{
		{"host/port", c.Host != "0.0.0.0" || c.Port != 8787},
		{"UpstreamURL", c.UpstreamURL != "https://api.exa.ai"},
		{"StatePath", c.StatePath != "./exa-proxy.sqlite"},
		{"SelectionStrategy", c.SelectionStrategy != StrategyWeightedRoundRobin},
		{"attempts/timeout", c.MaxAttempts != 3 || c.AttemptTimeoutMs != 30000},
		{"RetryBackoffMs", len(c.RetryBackoffMs) != 3 || c.RetryBackoffMs[0] != 200 || c.RetryBackoffMs[2] != 1500},
		{"failure params", c.FailureThreshold != 3 || c.FailureWindowSeconds != 60 || c.CooldownSeconds != 120},
		{"cooldowns", c.RateLimitCooldownSeconds != 300 || c.CreditsExhaustedCooldownSeconds != 600},
		{"MaxBodyBytes", c.MaxBodyBytes != 20971520},
		{"AllowedPaths", len(c.AllowedPaths) != 1 || c.AllowedPaths[0] != "/**"},
		{"affinity/logLevel", !c.ResourceAffinity || c.LogLevel != "info"},
		{"AdminSessionTTLSeconds", c.AdminSessionTTLSeconds != 604800},
		{"lockout", c.AdminLockoutMaxFailures != 5 || c.AdminLockoutWindowSeconds != 300 || c.AdminLockoutSeconds != 900},
		{"flags", c.AdminRequireHTTPS || !c.AllowRawKeyDisplay || !c.VersionCheckEnabled},
		{"retention/trend", c.LogRetentionDays != 14 || c.TrendWindowHours != 24},
		{"alerts", c.AlertAvailableKeyMin != 1 || c.AlertFailureRatePercent != 10 || c.AlertRateLimitRatePercent != 20},
		{"webhook", c.AlertWebhookCooldownSeconds != 300 || c.AlertWebhookMaxAttempts != 1 || c.AlertWebhookRetryBackoffMs != 250},
		{"trustProxy/h2", c.TrustProxy || !c.UpstreamAllowH2},
		{"cache/pool", c.SearchCacheTTLSeconds != 0 || c.UpstreamPoolConnections != 128},
		{"affinityDays/rateLimit", c.AffinityRetentionDays != 7 || c.ProxyRateLimitPerMinute != 0},
	}
	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			if check.fail {
				t.Errorf("default %s deviated", check.name)
			}
		})
	}
}

// customEnvFixture applies the shared custom-env baseline for Load tests.
func customEnvFixture(t *testing.T) Config {
	t.Helper()
	clearExaEnv(t)
	t.Setenv("HOST", "127.0.0.1")
	t.Setenv("PORT", "9000")
	t.Setenv("EXA_UPSTREAM_URL", "https://api.exa.ai/")
	t.Setenv("EXA_PROXY_TOKENS", "tok-a, tok-b ,tok-c")
	t.Setenv("EXA_ADMIN_TOKENS", "admin-1")
	t.Setenv("EXA_KEYS", "k1:v1:3, plainkey")
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET", "0123456789abcdef")
	t.Setenv("EXA_STATE_PATH", "/data/gate.sqlite")
	t.Setenv("EXA_SELECTION_STRATEGY", "least_recently_used")
	t.Setenv("EXA_MAX_ATTEMPTS", "5")
	t.Setenv("EXA_RETRY_BACKOFF_MS", "100, 200, 400, 800")
	t.Setenv("EXA_ALLOWED_PATHS", "/search,/contents")
	t.Setenv("EXA_RESOURCE_AFFINITY", "false")
	t.Setenv("EXA_ADMIN_REQUIRE_HTTPS", "true")
	t.Setenv("EXA_ADMIN_ALLOW_RAW_KEY_DISPLAY", "false")
	t.Setenv("EXA_VERSION_CHECK", "false")
	t.Setenv("EXA_UPSTREAM_ALLOW_H2", "false")
	t.Setenv("EXA_TRUST_PROXY", "true")
	t.Setenv("EXA_SEARCH_CACHE_TTL", "120")
	t.Setenv("EXA_ALERT_WEBHOOK_MAX_ATTEMPTS", "0") // clamped up to 1
	return Load()
}

func TestLoadCustomEnv(t *testing.T) {
	c := customEnvFixture(t)

	if c.Port != 9000 || c.Host != "127.0.0.1" {
		t.Errorf("host/port = %s:%d", c.Host, c.Port)
	}
	if c.UpstreamURL != "https://api.exa.ai" {
		t.Errorf("UpstreamURL trailing slash not trimmed: %q", c.UpstreamURL)
	}
	if len(c.ProxyTokens) != 3 || c.ProxyTokens[1] != "tok-b" {
		t.Errorf("ProxyTokens = %v", c.ProxyTokens)
	}
	if len(c.Keys) != 2 || c.Keys[0].ID != "k1" || c.Keys[0].Weight != 3 || c.Keys[1].ID != "key_2" {
		t.Errorf("Keys = %+v", c.Keys)
	}
	if c.SelectionStrategy != StrategyLRU {
		t.Errorf("SelectionStrategy = %q", c.SelectionStrategy)
	}
	if c.MaxAttempts != 5 || len(c.RetryBackoffMs) != 4 || c.RetryBackoffMs[3] != 800 {
		t.Errorf("attempts=%d backoffs=%v", c.MaxAttempts, c.RetryBackoffMs)
	}
	if len(c.AllowedPaths) != 2 || c.AllowedPaths[1] != "/contents" {
		t.Errorf("AllowedPaths = %v", c.AllowedPaths)
	}
}

func TestLoadCustomEnvBooleans(t *testing.T) {
	c := customEnvFixture(t)

	if c.ResourceAffinity {
		t.Error("ResourceAffinity should be false with EXA_RESOURCE_AFFINITY=false")
	}
	if !c.AdminRequireHTTPS || c.AllowRawKeyDisplay || c.VersionCheckEnabled || c.UpstreamAllowH2 {
		t.Error("boolean flags did not parse")
	}
	if !c.TrustProxy {
		t.Error("TrustProxy should be true")
	}
	if c.SearchCacheTTLSeconds != 120 {
		t.Errorf("SearchCacheTTLSeconds = %d", c.SearchCacheTTLSeconds)
	}
	if c.AlertWebhookMaxAttempts != 1 {
		t.Errorf("AlertWebhookMaxAttempts = %d, want clamped 1", c.AlertWebhookMaxAttempts)
	}
}

func TestParseKeySeeds(t *testing.T) {
	if got := ParseKeySeeds(""); got != nil {
		t.Errorf("empty input = %+v, want nil", got)
	}
	cases := []struct {
		name string
		raw  string
		want []KeySeed
	}{
		{"bare value gets auto id", "secret-value", []KeySeed{{ID: "key_1", Value: "secret-value", Weight: 1, Enabled: true}}},
		{"id:value:weight", "a:b:5", []KeySeed{{ID: "a", Value: "b", Weight: 5, Enabled: true}}},
		{"weight zero falls back to 1", "a:b:0", []KeySeed{{ID: "a", Value: "b", Weight: 1, Enabled: true}}},
		{"weight garbage falls back to 1", "a:b:xyz", []KeySeed{{ID: "a", Value: "b", Weight: 1, Enabled: true}}},
		{"extra colons join into value", "a:b:c:d", []KeySeed{{ID: "a", Value: "b:c:d", Weight: 1, Enabled: true}}},
		{"multiple entries", "one,two:three:2", []KeySeed{
			{ID: "key_1", Value: "one", Weight: 1, Enabled: true},
			{ID: "two", Value: "three", Weight: 2, Enabled: true},
		}},
		{"blank entries skipped", " one , ,  ", []KeySeed{{ID: "key_1", Value: "one", Weight: 1, Enabled: true}}},
	}
	for _, c := range cases {
		got := ParseKeySeeds(c.raw)
		if len(got) != len(c.want) {
			t.Errorf("%s: got %d keys %+v, want %+v", c.name, len(got), got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("%s: key %d = %+v, want %+v", c.name, i, got[i], c.want[i])
			}
		}
	}
}

func TestParseStrategy(t *testing.T) {
	valid := map[string]Strategy{
		"round_robin":          StrategyRoundRobin,
		"least_recently_used":  StrategyLRU,
		"adaptive_weighted":    StrategyAdaptiveWeighted,
		"weighted_round_robin": StrategyWeightedRoundRobin,
	}
	for in, want := range valid {
		if got := parseStrategy(in); got != want {
			t.Errorf("parseStrategy(%q) = %q, want %q", in, got, want)
		}
	}
	for _, in := range []string{"", "bogus", "ROUND_ROBIN"} {
		if got := parseStrategy(in); got != StrategyWeightedRoundRobin {
			t.Errorf("parseStrategy(%q) = %q, want default weighted", in, got)
		}
	}
}

func TestNumberListFallbacks(t *testing.T) {
	clearExaEnv(t)
	t.Setenv("EXA_RETRY_BACKOFF_MS", "a,b")
	if got := Load().RetryBackoffMs; len(got) != 3 {
		t.Errorf("all-invalid list should fall back to default, got %v", got)
	}
	clearExaEnv(t)
	t.Setenv("EXA_RETRY_BACKOFF_MS", "1, x ,2")
	got := Load().RetryBackoffMs
	if len(got) != 2 || got[0] != 1 || got[1] != 2 {
		t.Errorf("mixed list = %v, want [1 2]", got)
	}
}

func TestValidate(t *testing.T) {
	c := &Config{EncryptionSecret: "short"}
	if err := c.Validate(); err == nil {
		t.Error("short secret should fail validation")
	}
	c.EncryptionSecret = "0123456789abcdef"
	if err := c.Validate(); err != nil {
		t.Errorf("valid secret rejected: %v", err)
	}
}

func TestLoadKeysFile(t *testing.T) {
	clearExaEnv(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "keys.txt")
	if err := os.WriteFile(path, []byte("filekey1\nfilekey2:fv:2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("EXA_KEYS", "envkey")
	t.Setenv("EXA_KEYS_FILE", path)
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET", "0123456789abcdef")

	c := Load()
	if len(c.Keys) != 3 {
		t.Fatalf("keys = %+v, want 3 (1 env + 2 file)", c.Keys)
	}
	// Line-based parsing: bare line gets the next auto id, "id:value:weight"
	// line keeps its explicit id.
	if c.Keys[0].ID != "key_1" || c.Keys[1].ID != "key_2" || c.Keys[1].Value != "filekey1" ||
		c.Keys[2].ID != "filekey2" || c.Keys[2].Value != "fv" || c.Keys[2].Weight != 2 {
		t.Errorf("keys = %+v", c.Keys)
	}

	// Missing file is silently ignored (env keys still load).
	clearExaEnv(t)
	t.Setenv("EXA_KEYS", "envkey")
	t.Setenv("EXA_KEYS_FILE", filepath.Join(dir, "missing.txt"))
	c = Load()
	if len(c.Keys) != 1 {
		t.Errorf("missing file keys = %+v, want only env key", c.Keys)
	}
}

func TestTrustProxyValues(t *testing.T) {
	for raw, want := range map[string]bool{"true": true, "false": false, "": false, "1": true, "yes": true} {
		clearExaEnv(t)
		t.Setenv("EXA_TRUST_PROXY", raw)
		if got := Load().TrustProxy; got != want {
			t.Errorf("TrustProxy(%q) = %v, want %v", raw, got, want)
		}
	}
}

func TestEncryptionSecretShortIsBlanked(t *testing.T) {
	clearExaEnv(t)
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET", "tooshort")
	c := Load()
	if c.EncryptionSecret != "" {
		t.Errorf("short secret should be blanked for Validate(), got %q", c.EncryptionSecret)
	}
	if err := c.Validate(); !errors.Is(err, ErrSecretRequired) {
		t.Errorf("Validate() = %v, want ErrSecretRequired", err)
	}
}

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
