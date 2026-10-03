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

	cfg := config.Load()

	// Startup diagnostics so `docker logs` shows exactly what the binary sees.
	fmt.Fprintf(os.Stderr, "exa-gate %s starting", version)
	fmt.Fprintf(os.Stderr, "  state path: %s", cfg.StatePath)
	fmt.Fprintf(os.Stderr, "  listen: %s:%d", cfg.Host, cfg.Port)
	fmt.Fprintf(os.Stderr, "  upstream: %s", cfg.UpstreamURL)
	fmt.Fprintf(os.Stderr, "  strategy: %s", cfg.SelectionStrategy)
	fmt.Fprintf(os.Stderr, "  encryption secret length: %d", len(cfg.EncryptionSecret))
	fmt.Fprintf(os.Stderr, "  proxy tokens: %d configured", len(cfg.ProxyTokens))
	fmt.Fprintf(os.Stderr, "  admin tokens: %d configured", len(cfg.AdminTokens))
	fmt.Fprintf(os.Stderr, "  raw key display: %v", cfg.AllowRawKeyDisplay)

	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "FATAL config validation: %v", err)
		os.Exit(1)
	}
	fmt.Fprintln(os.Stderr, "  config validation passed")

	if _, err := os.Stat(filepath.Dir(cfg.StatePath)); err != nil {
		fmt.Fprintf(os.Stderr, "FATAL state directory check: %v", err)
		os.Exit(1)
	}

	store, err := state.Open(cfg.StatePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL state open: %v", err)
		os.Exit(1)
	}
	defer store.Close()
	fmt.Fprintln(os.Stderr, "  state database opened successfully")

	// Boot keys: env seeds plus persistent rows (DB is source of truth).
	var schedKeys []scheduler.Key
	seen := map[string]bool{}
	for _, seed := range cfg.Keys {
		if len(cfg.EncryptionSecret) >= 16 {
			if encrypted, err := keycrypt.Encrypt(seed.Value, cfg.EncryptionSecret); err == nil {
				_ = store.SeedKeys([]state.KeySeed{{ID: seed.ID, Value: &encrypted, Weight: seed.Weight, Enabled: seed.Enabled}})
			}
		}
		schedKeys = append(schedKeys, scheduler.Key{ID: seed.ID, Value: seed.Value, Weight: seed.Weight, Enabled: seed.Enabled})
		seen[seed.ID] = true
	}
	persistent, err := store.ListPersistentKeys()
	if err != nil {
		fmt.Fprintln(os.Stderr, "list persistent keys:", err)
		os.Exit(1)
	}
	for _, row := range persistent {
		if seen[row.ID] || row.Value == nil || *row.Value == "" {
			continue
		}
		var plaintext string
		plaintext, err := keycrypt.Decrypt(*row.Value, cfg.EncryptionSecret)
		if err != nil {
			if cfg.LegacyEncryptionSecret != "" {
				if plaintext, err = keycrypt.Decrypt(*row.Value, cfg.LegacyEncryptionSecret); err != nil {
					fmt.Fprintf(os.Stderr, "key %q unreadable with current or legacy secret\n", row.ID)
					os.Exit(1)
				}
				// Re-encrypt with the current secret (rotation migration).
				reEncrypted, err := keycrypt.Encrypt(plaintext, cfg.EncryptionSecret)
				if err == nil {
					_ = store.SeedKeys([]state.KeySeed{{ID: row.ID, Value: &reEncrypted, Weight: row.Weight, Enabled: row.Enabled}})
				}
			} else {
				fmt.Fprintf(os.Stderr, "key %q unreadable with current secret; set EXA_KEYS_ENCRYPTION_SECRET_LEGACY to rotate\n", row.ID)
				os.Exit(1)
			}
		} else {
			plaintext = *row.Value
		}
		schedKeys = append(schedKeys, scheduler.Key{ID: row.ID, Value: plaintext, Weight: row.Weight, Enabled: row.Enabled})
		seen[row.ID] = true
	}

	fmt.Fprintf(os.Stderr, "  loaded %d keys (config + persistent)", len(schedKeys))

	sched := scheduler.New(schedKeys, scheduler.Strategy(cfg.SelectionStrategy))

	// Adaptive stats refresh from persisted counters every 5s.
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if stats, err := store.ListKeyStats(); err == nil {
				sched.UpdateAdaptiveStats(toSchedulerStats(stats))
			}
		}
	}()

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
	adminapi.RegisterConsole(root, version, proxyHandler)
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

	go func() {
		fmt.Printf("exa-gate %s listening on %s (upstream %s, %d keys)\n", version, addr, cfg.UpstreamURL, len(schedKeys))
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintln(os.Stderr, "listen:", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	fmt.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 9*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
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
