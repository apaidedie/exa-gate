// Command exa-gate is the Go implementation of the Exa API key-pool gateway:
// proxy core, admin API and the embedded static console in a single binary.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"github.com/apaidedie/exa-gate/internal/adminapi"
	"github.com/apaidedie/exa-gate/internal/config"
	"github.com/apaidedie/exa-gate/internal/keycrypt"
	"github.com/apaidedie/exa-gate/internal/proxy"
	"github.com/apaidedie/exa-gate/internal/scheduler"
	"github.com/apaidedie/exa-gate/internal/state"
	"github.com/apaidedie/exa-gate/internal/upstream"
)

const version = adminapi.Version

// baseUpstream adapts the upstream client to the proxy's UpstreamClient by
// prepending the configured base URL to the request path.
type baseUpstream struct {
	client *upstream.Client
	base   string
}

func (b *baseUpstream) Do(pathAndQuery, method string, headers map[string]string, body []byte, timeoutMs int64, clientGone <-chan struct{}) (*http.Response, error) {
	target := strings.TrimSuffix(b.base, "/") + pathAndQuery
	return b.client.Do(target, method, headers, body, timeoutMs, clientGone)
}

func main() {
	defer func() {
		if r := recover(); r != nil {
			fmt.Fprintf(os.Stderr, "FATAL PANIC: %v", r)
			os.Exit(1)
		}
	}()

	if err := run(context.Background()); err != nil {
		fmt.Fprintf(os.Stderr, "FATAL %v", err)
		os.Exit(1)
	}
}

// run wires the whole gateway and blocks until shutdown. ctx cancellation
// (in addition to SIGINT/SIGTERM) triggers graceful shutdown; errors return
// instead of exiting so deferred cleanup and tests work.
func run(ctx context.Context) error {
	cfg := config.Load()
	logStartupDiagnostics(cfg)

	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("config validation: %w", err)
	}
	if _, err := os.Stat(filepath.Dir(cfg.StatePath)); err != nil {
		return fmt.Errorf("state directory check: %w", err)
	}

	store, err := state.Open(cfg.StatePath)
	if err != nil {
		return fmt.Errorf("state open: %w", err)
	}
	defer store.Close()

	// Boot keys: env seeds plus persistent rows (DB is source of truth).
	schedKeys, err := loadBootKeys(store, cfg)
	if err != nil {
		return err
	}

	fmt.Fprintf(os.Stderr, "  loaded %d keys (config + persistent)", len(schedKeys))

	sched := scheduler.New(schedKeys, scheduler.Strategy(cfg.SelectionStrategy))

	// Adaptive stats refresh from persisted counters every 5s.
	go scheduleAdaptiveRefresh(ctx, store, sched)

	// Retention maintenance every hour: request logs, resource affinity and
	// expired admin sessions are pruned per configuration so the tables stay
	// bounded without anyone calling the prune endpoint.
	go scheduleRetentionMaintenance(ctx, store, cfg)

	client := upstream.New(cfg.UpstreamURL, cfg.UpstreamPoolConnections, cfg.UpstreamAllowH2)
	proxyHandler := &proxy.Handler{
		Deps: proxy.Deps{
			State: store,
			NextKey: func(now int64, exclude map[string]bool) (proxy.SchedulerKey, bool) {
				key, ok := sched.Next(now, exclude)
				return proxy.SchedulerKey{ID: key.ID, Value: key.Value}, ok
			},
			GetKey: func(id string) (proxy.SchedulerKey, bool) {
				key, ok := sched.GetKey(id)
				return proxy.SchedulerKey{ID: key.ID, Value: key.Value}, ok
			},
			GetByID: func(id string, now int64) (proxy.SchedulerKey, bool) {
				key, ok := sched.GetByID(id, now)
				return proxy.SchedulerKey{ID: key.ID, Value: key.Value}, ok
			},
			RecordFailure:            sched.RecordFailure,
			RecordSuccess:            sched.RecordSuccess,
			CoolDown:                 sched.CoolDown,
			SetDisabled:              sched.SetDisabled,
			ProxyTokens:              cfg.ProxyTokens,
			AllowedPaths:             cfg.AllowedPaths,
			MaxAttempts:              cfg.MaxAttempts,
			AttemptTimeoutMs:         cfg.AttemptTimeoutMs,
			RetryBackoffMs:           cfg.RetryBackoffMs,
			FailureThreshold:         cfg.FailureThreshold,
			FailureWindowSeconds:     cfg.FailureWindowSeconds,
			CooldownSeconds:          cfg.CooldownSeconds,
			RateLimitCooldownSeconds: cfg.RateLimitCooldownSeconds,
			ResourceAffinity:         cfg.ResourceAffinity,
			SearchCacheTTLSeconds:    cfg.SearchCacheTTLSeconds,
			MaxBodyBytes:             cfg.MaxBodyBytes,
			RateLimiter:              proxy.NewTokenLimiter(cfg.ProxyRateLimitPerMinute, time.Minute),
		},
	}
	proxyHandler.Deps.Upstream = &baseUpstream{client: client, base: cfg.UpstreamURL}

	adminServer := &adminapi.Server{
		Cfg:       cfg,
		Store:     store,
		Scheduler: sched,
	}

	root := http.NewServeMux()
	admin := http.NewServeMux()
	adminServer.Init()
	adminServer.Register(admin)
	adminapi.RegisterConsole(root, proxyHandler)
	root.Handle("/_proxy/", admin)

	// Panic recovery: log and return 500 instead of killing the connection.
	recoverHandler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				fmt.Fprintf(os.Stderr, "PANIC serving %s %s: %v\n%s\n", req.Method, req.URL.Path, rec, debug.Stack())
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		root.ServeHTTP(w, req)
	})

	addr := cfg.Host + ":" + fmt.Sprint(cfg.Port)
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           recoverHandler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	listenErr := make(chan error, 1)
	go serve(httpServer, addr, cfg, len(schedKeys), listenErr)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case <-stop:
	case <-ctx.Done():
	case err := <-listenErr:
		return fmt.Errorf("listen: %w", err)
	}
	fmt.Println("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 9*time.Second)
	defer cancel()
	return httpServer.Shutdown(shutdownCtx)
}

// logStartupDiagnostics prints what the binary sees so `docker logs`
// explains every boot decision.
func logStartupDiagnostics(cfg config.Config) {
	fmt.Fprintf(os.Stderr, "exa-gate %s starting", version)
	fmt.Fprintf(os.Stderr, "  state path: %s", cfg.StatePath)
	fmt.Fprintf(os.Stderr, "  listen: %s:%d", cfg.Host, cfg.Port)
	fmt.Fprintf(os.Stderr, "  upstream: %s", cfg.UpstreamURL)
	fmt.Fprintf(os.Stderr, "  strategy: %s", cfg.SelectionStrategy)
	fmt.Fprintf(os.Stderr, "  encryption secret length: %d", len(cfg.EncryptionSecret))
	fmt.Fprintf(os.Stderr, "  proxy tokens: %d configured", len(cfg.ProxyTokens))
	fmt.Fprintf(os.Stderr, "  admin tokens: %d configured", len(cfg.AdminTokens))
	fmt.Fprintf(os.Stderr, "  raw key display: %v", cfg.AllowRawKeyDisplay)
	fmt.Fprintln(os.Stderr, "  config validation passed")
	fmt.Fprintln(os.Stderr, "  state database opened successfully")
}

// serve runs the HTTP listener and reports terminal failures.
func serve(httpServer *http.Server, addr string, cfg config.Config, keyCount int, listenErr chan<- error) {
	fmt.Printf("exa-gate %s listening on %s (upstream %s, %d keys)\n", version, addr, cfg.UpstreamURL, keyCount)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		listenErr <- err
	}
}

// loadBootKeys merges env-seeded keys with persistent rows (DB is source of
// truth): env seeds are persisted encrypted, persistent rows are decrypted
// with the current secret, falling back to the legacy secret with re-encrypt
// migration for rotation.
func loadBootKeys(store *state.Store, cfg config.Config) ([]scheduler.Key, error) {
	keys, seen := seedEnvKeys(store, cfg)
	persistent, err := store.ListPersistentKeys()
	if err != nil {
		return nil, fmt.Errorf("list persistent keys: %w", err)
	}
	if err := mergePersistentKeys(store, cfg, persistent, &keys, seen); err != nil {
		return nil, err
	}
	return keys, nil
}

// seedEnvKeys persists the environment-seeded keys encrypted and mirrors
// them into the scheduler seed list.
func seedEnvKeys(store *state.Store, cfg config.Config) ([]scheduler.Key, map[string]bool) {
	var keys []scheduler.Key
	seen := map[string]bool{}
	for _, seed := range cfg.Keys {
		if len(cfg.EncryptionSecret) >= 16 {
			if encrypted, err := keycrypt.Encrypt(seed.Value, cfg.EncryptionSecret); err == nil {
				_ = store.SeedKeys([]state.KeySeed{{ID: seed.ID, Value: &encrypted, Weight: seed.Weight, Enabled: seed.Enabled}})
			}
		}
		keys = append(keys, scheduler.Key{ID: seed.ID, Value: seed.Value, Weight: seed.Weight, Enabled: seed.Enabled})
		seen[seed.ID] = true
	}
	return keys, seen
}

// mergePersistentKeys decrypts every not-yet-seen persistent row, migrating
// legacy-encrypted values to the current secret on the fly.
func mergePersistentKeys(store *state.Store, cfg config.Config, persistent []state.KeySeed, keys *[]scheduler.Key, seen map[string]bool) error {
	for _, row := range persistent {
		if seen[row.ID] || row.Value == nil || *row.Value == "" {
			continue
		}
		plaintext, err := keycrypt.Decrypt(*row.Value, cfg.EncryptionSecret)
		if err != nil {
			if cfg.LegacyEncryptionSecret == "" {
				return fmt.Errorf("key %q unreadable with current secret; set EXA_KEYS_ENCRYPTION_SECRET_LEGACY to rotate", row.ID)
			}
			if plaintext, err = keycrypt.Decrypt(*row.Value, cfg.LegacyEncryptionSecret); err != nil {
				return fmt.Errorf("key %q unreadable with current or legacy secret", row.ID)
			}
			// Re-encrypt with the current secret (rotation migration).
			if reEncrypted, encErr := keycrypt.Encrypt(plaintext, cfg.EncryptionSecret); encErr == nil {
				_ = store.SeedKeys([]state.KeySeed{{ID: row.ID, Value: &reEncrypted, Weight: row.Weight, Enabled: row.Enabled}})
			}
		}
		*keys = append(*keys, scheduler.Key{ID: row.ID, Value: plaintext, Weight: row.Weight, Enabled: row.Enabled})
		seen[row.ID] = true
	}
	return nil
}

// scheduleAdaptiveRefresh feeds persisted key counters into the scheduler's
// adaptive weights every 5 seconds until ctx is cancelled.
func scheduleAdaptiveRefresh(ctx context.Context, store *state.Store, sched *scheduler.Scheduler) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if stats, err := store.ListKeyStats(); err == nil {
				sched.UpdateAdaptiveStats(toSchedulerStats(stats))
			}
		case <-ctx.Done():
			return
		}
	}
}

// scheduleRetentionMaintenance prunes expired rows every hour until ctx is
// cancelled.
func scheduleRetentionMaintenance(ctx context.Context, store *state.Store, cfg config.Config) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			pruneExpired(store, cfg, time.Now().UnixMilli())
		case <-ctx.Done():
			return
		}
	}
}

// pruneExpired removes request logs older than the retention window,
// resource affinity rows older than the affinity window and expired admin
// sessions. Errors are non-fatal: the next hourly pass retries.
func pruneExpired(store *state.Store, cfg config.Config, now int64) {
	if cfg.LogRetentionDays > 0 {
		if _, err := store.PruneLogs(now - int64(cfg.LogRetentionDays)*24*3600000); err != nil {
			fmt.Fprintf(os.Stderr, "maintenance: prune logs: %v\n", err)
		}
	}
	if cfg.AffinityRetentionDays > 0 {
		if _, err := store.PruneAffinity(now - int64(cfg.AffinityRetentionDays)*24*3600000); err != nil {
			fmt.Fprintf(os.Stderr, "maintenance: prune affinity: %v\n", err)
		}
	}
	if err := store.PruneSessions(now); err != nil {
		fmt.Fprintf(os.Stderr, "maintenance: prune sessions: %v\n", err)
	}
}

func toSchedulerStats(stats []state.KeyStats) []scheduler.Stats {
	out := make([]scheduler.Stats, 0, len(stats))
	for _, stat := range stats {
		out = append(out, scheduler.Stats{
			ID: stat.ID, Enabled: stat.Enabled, Weight: stat.Weight,
			TotalRequests: stat.TotalRequests, SuccessCount: stat.SuccessCount,
			FailureCount: stat.FailureCount, RateLimitCount: stat.RateLimitCount,
			TimeoutCount: stat.TimeoutCount, CreditsExhaustedCount: stat.CreditsExhaustedCount,
			CooldownUntil: stat.CooldownUntil, CooldownReason: stat.CooldownReason,
			LastStatus: derefInt(stat.LastStatus), LastError: stat.LastError,
			LastLatencyMs: derefIntDefault(stat.LastLatencyMs, 500),
		})
	}
	return out
}

func derefInt(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func derefIntDefault(value *int64, def int64) int64 {
	if value == nil {
		return def
	}
	return *value
}
