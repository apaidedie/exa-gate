package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/apaidedie/exa-gate/internal/config"
	"github.com/apaidedie/exa-gate/internal/keycrypt"
	"github.com/apaidedie/exa-gate/internal/state"
	"github.com/apaidedie/exa-gate/internal/upstream"
)

const (
	currentSecret = "current-secret-16"
	legacySecret  = "legacy-secret-16"
	clientToken   = "client-token-16ch"
	adminToken    = "admin-token-16ch"
)

func TestToSchedulerStatsAndDerefHelpers(t *testing.T) {
	seven := int64(7)
	nine := int64(9)
	stats := toSchedulerStats([]state.KeyStats{
		{ID: "a", Enabled: true, Weight: 2, LastStatus: &seven, LastLatencyMs: &nine},
		{ID: "b", CooldownReason: strPtr("rate_limit")},
	})
	if len(stats) != 2 {
		t.Fatalf("stats = %d", len(stats))
	}
	if stats[0].LastStatus != 7 || stats[0].LastLatencyMs != 9 {
		t.Errorf("deref values = %d/%d", stats[0].LastStatus, stats[0].LastLatencyMs)
	}
	if stats[1].LastStatus != 0 || stats[1].LastLatencyMs != 500 {
		t.Errorf("defaults = %d/%d, want 0/500", stats[1].LastStatus, stats[1].LastLatencyMs)
	}
	if stats[1].CooldownReason == nil || *stats[1].CooldownReason != "rate_limit" {
		t.Errorf("cooldown reason not forwarded: %v", stats[1].CooldownReason)
	}
	if derefInt(nil) != 0 || derefInt(&nine) != 9 {
		t.Error("derefInt broken")
	}
	if derefIntDefault(nil, 3) != 3 || derefIntDefault(&seven, 3) != 7 {
		t.Error("derefIntDefault broken")
	}
}

func TestBaseUpstreamJoinsBaseAndPath(t *testing.T) {
	var seenPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.RequestURI()
		w.WriteHeader(200)
	}))
	defer ts.Close()

	adapter := &baseUpstream{client: upstream.New(ts.URL, 2, false), base: ts.URL + "/"}
	resp, err := adapter.Do("/search?q=1", "GET", nil, nil, 5000, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if seenPath != "/search?q=1" {
		t.Errorf("upstream path = %q, want /search?q=1", seenPath)
	}
	// Base without trailing slash also joins cleanly.
	adapter2 := &baseUpstream{client: upstream.New(ts.URL, 2, false), base: ts.URL}
	resp, err = adapter2.Do("/x", "GET", nil, nil, 5000, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
}

// bootEnv wires a deterministic environment for run(): temp state file,
// free localhost port, fixed tokens. Returns the port to poll.
func bootEnv(t *testing.T, statePath string) int {
	t.Helper()
	port := freePort(t)
	t.Setenv("HOST", "127.0.0.1")
	t.Setenv("PORT", strconv.Itoa(port))
	t.Setenv("EXA_STATE_PATH", statePath)
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET", currentSecret)
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET_LEGACY", "")
	t.Setenv("EXA_PROXY_TOKENS", clientToken)
	t.Setenv("EXA_ADMIN_TOKENS", adminToken)
	t.Setenv("EXA_KEYS", "")
	t.Setenv("EXA_KEYS_FILE", "")
	return port
}

func freePort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func waitLive(t *testing.T, port int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	url := fmt.Sprintf("http://127.0.0.1:%d/_proxy/live", port)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return
			}
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("gateway did not come live at %s", url)
}

func stopRun(t *testing.T, errCh <-chan error, cancel context.CancelFunc) {
	t.Helper()
	cancel()
	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("run returned error on clean shutdown: %v", err)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("run did not return after context cancel")
	}
}

func TestRunBootsAndShutsDownCleanly(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "gate.sqlite")
	port := bootEnv(t, statePath)
	t.Setenv("EXA_KEYS", "envkey:envvalue:2")

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- run(ctx) }()

	waitLive(t, port)
	// The console index answers through the full wiring.
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/", port))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !strings.Contains(string(body), "<html") {
		t.Errorf("console index = %d %q", resp.StatusCode, string(body[:min(len(body), 80)]))
	}

	stopRun(t, errCh, cancel)

	// Env-seeded key persisted encrypted at rest.
	store, err := state.Open(statePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	encrypted, _ := store.GetKeyValue("envkey")
	if encrypted == nil || *encrypted == "envvalue" || !keycrypt.IsEncryptedFormat(*encrypted) {
		t.Fatalf("seed value not encrypted at rest: %v", encrypted)
	}
	plaintext, err := keycrypt.Decrypt(*encrypted, currentSecret)
	if err != nil || plaintext != "envvalue" {
		t.Errorf("seed value roundtrip = %q, %v", plaintext, err)
	}
}

func TestRunRejectsInvalidConfig(t *testing.T) {
	bootEnv(t, filepath.Join(t.TempDir(), "gate.sqlite"))
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET", "short")

	err := run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "config validation") {
		t.Fatalf("run error = %v, want config validation failure", err)
	}
}

func TestRunRejectsMissingStateDirectory(t *testing.T) {
	// The parent directory of the state path must exist (main refuses to
	// create it): one level deeper than an existing dir fails the check.
	statePath := filepath.Join(t.TempDir(), "missing-subdir", "gate.sqlite")
	bootEnv(t, statePath)

	err := run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "state directory check") {
		t.Fatalf("run error = %v, want state directory failure", err)
	}
}

func TestRunRejectsUnopenableStatePath(t *testing.T) {
	// Parent exists but is a file: the directory check passes, state.Open
	// fails on mkdir.
	dir := t.TempDir()
	blocker := filepath.Join(dir, "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	bootEnv(t, filepath.Join(blocker, "gate.sqlite"))

	err := run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "state open") {
		t.Fatalf("run error = %v, want state open failure", err)
	}
}

func TestRunRejectsUnreadableKeyWithoutLegacySecret(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "gate.sqlite")
	store, err := state.Open(statePath)
	if err != nil {
		t.Fatal(err)
	}
	garbage := "00112233445566778899001122334455:00112233445566778899001122334455:00112233445566778899001122334455"
	if err := store.SeedKeys([]state.KeySeed{{ID: "poison", Value: &garbage, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	store.Close()

	bootEnv(t, statePath)
	err = run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "unreadable with current secret") {
		t.Fatalf("run error = %v, want unreadable-key failure", err)
	}
}

func TestRunLegacySecretRotatesKeys(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "gate.sqlite")
	store, err := state.Open(statePath)
	if err != nil {
		t.Fatal(err)
	}
	legacyEncrypted, err := keycrypt.Encrypt("old-plaintext", legacySecret)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SeedKeys([]state.KeySeed{{ID: "rotate-me", Value: &legacyEncrypted, Weight: 3, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	store.Close()

	port := bootEnv(t, statePath)
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET_LEGACY", legacySecret)

	ctx, cancel := context.WithCancel(context.Background())
	errCh := make(chan error, 1)
	go func() { errCh <- run(ctx) }()
	waitLive(t, port)
	stopRun(t, errCh, cancel)

	// The row was re-encrypted with the CURRENT secret.
	store, err = state.Open(statePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	value, _ := store.GetKeyValue("rotate-me")
	if value == nil {
		t.Fatal("rotated row vanished")
	}
	plaintext, err := keycrypt.Decrypt(*value, currentSecret)
	if err != nil {
		t.Fatalf("row not re-encrypted with current secret: %v", err)
	}
	if plaintext != "old-plaintext" {
		t.Errorf("rotated plaintext = %q", plaintext)
	}
	// And it kept its weight.
	stats, _ := store.ListKeyStats()
	if len(stats) != 1 || stats[0].Weight != 3 {
		t.Errorf("stats after rotation = %+v", stats)
	}
}

func TestRunFailsOnPortConflict(t *testing.T) {
	// Occupy the port first: ListenAndServe must surface the error.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port

	t.Setenv("HOST", "127.0.0.1")
	t.Setenv("PORT", strconv.Itoa(port))
	t.Setenv("EXA_STATE_PATH", filepath.Join(t.TempDir(), "gate.sqlite"))
	t.Setenv("EXA_KEYS_ENCRYPTION_SECRET", currentSecret)
	t.Setenv("EXA_PROXY_TOKENS", clientToken)
	t.Setenv("EXA_ADMIN_TOKENS", adminToken)
	t.Setenv("EXA_KEYS", "")

	err = run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "listen") {
		t.Fatalf("run error = %v, want listen failure", err)
	}
}

func strPtr(v string) *string { return &v }

func TestPruneExpiredRespectsRetentionWindows(t *testing.T) {
	store, err := state.Open(filepath.Join(t.TempDir(), "maint.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	now := time.Now().UnixMilli()
	day := int64(24 * 3600000)
	cfg := config.Config{LogRetentionDays: 2, AffinityRetentionDays: 1}

	// Logs: one inside the 2-day window, one older.
	if err := store.RecordRequestLog(state.RequestLog{RequestID: "fresh", Method: "GET", Path: "/", Status: 200, CreatedAt: now - day}); err != nil {
		t.Fatal(err)
	}
	if err := store.RecordRequestLog(state.RequestLog{RequestID: "stale", Method: "GET", Path: "/", Status: 200, CreatedAt: now - 3*day}); err != nil {
		t.Fatal(err)
	}
	// Affinity: one inside the 1-day window, one older.
	if err := store.SetAffinity("webset", "keep", "k", now-day/2); err != nil {
		t.Fatal(err)
	}
	if err := store.SetAffinity("webset", "drop", "k", now-2*day); err != nil {
		t.Fatal(err)
	}
	// Sessions: one live, one expired.
	if err := store.CreateSession(state.AdminSession{ID: "live", TokenID: "t", CreatedAt: now, ExpiresAt: now + day, LastSeenAt: now}); err != nil {
		t.Fatal(err)
	}
	if err := store.CreateSession(state.AdminSession{ID: "dead", TokenID: "t", CreatedAt: now - 2*day, ExpiresAt: now - day, LastSeenAt: now - 2*day}); err != nil {
		t.Fatal(err)
	}

	pruneExpired(store, cfg, now)

	logs, _ := store.ListRequestLogs(state.LogFilter{From: 0})
	if len(logs) != 1 || logs[0].RequestID != "fresh" {
		t.Errorf("logs after prune = %+v, want only fresh", logs)
	}
	if got, _ := store.GetAffinity("webset", "keep"); got == "" {
		t.Error("in-window affinity was pruned")
	}
	if got, _ := store.GetAffinity("webset", "drop"); got != "" {
		t.Error("stale affinity survived")
	}
	if _, err := store.GetSession("live"); err != nil {
		t.Error("live session was pruned")
	}
	if _, err := store.GetSession("dead"); err == nil {
		t.Error("expired session survived")
	}

	// Zero retention disables the respective prune (nothing deleted).
	cfg2 := config.Config{LogRetentionDays: 0, AffinityRetentionDays: 0}
	if err := store.RecordRequestLog(state.RequestLog{RequestID: "kept-zero", Method: "GET", Path: "/", Status: 200, CreatedAt: now - 100*day}); err != nil {
		t.Fatal(err)
	}
	pruneExpired(store, cfg2, now)
	logs, _ = store.ListRequestLogs(state.LogFilter{From: 0})
	if len(logs) != 2 {
		t.Errorf("zero retention should disable pruning, logs = %+v", logs)
	}
}
