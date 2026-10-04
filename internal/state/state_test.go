package state

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	// File-backed (not :memory:) so the 4-connection pool sees one database.
	st, err := Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { st.Close() })
	return st
}

func TestOpenCreatesSchema(t *testing.T) {
	st := newTestStore(t)
	var name string
	err := st.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='key_stats'").Scan(&name)
	if err != nil || name != "key_stats" {
		t.Fatalf("key_stats table missing: %v %q", err, name)
	}
	err = st.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_sessions'").Scan(&name)
	if err != nil || name != "admin_sessions" {
		t.Fatalf("admin_sessions table missing: %v %q", err, name)
	}
}

func TestOpenMigratesLegacySchema(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	// Pre-migration layout: no credits_exhausted_count / value / query columns.
	_, err = db.Exec(`
    CREATE TABLE key_stats (
      id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, weight INTEGER NOT NULL,
      total_requests INTEGER NOT NULL DEFAULT 0, success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0, retry_count INTEGER NOT NULL DEFAULT 0,
      rate_limit_count INTEGER NOT NULL DEFAULT 0, timeout_count INTEGER NOT NULL DEFAULT 0,
      cooldown_until INTEGER NOT NULL DEFAULT 0, cooldown_reason TEXT,
      last_status INTEGER, last_error TEXT, last_latency_ms INTEGER,
      last_success_at INTEGER, last_failure_at INTEGER
    );
    CREATE TABLE request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, token_id TEXT,
      method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL,
      key_ids_json TEXT NOT NULL, attempts INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
      error_code TEXT, created_at INTEGER NOT NULL
    );
    INSERT INTO key_stats (id, enabled, weight) VALUES ('legacy-key', 1, 2);
  `)
	if err != nil {
		t.Fatal(err)
	}
	db.Close()

	st, err := Open(path)
	if err != nil {
		t.Fatalf("reopen with migration: %v", err)
	}
	defer st.Close()

	stats, err := st.ListKeyStats()
	if err != nil || len(stats) != 1 {
		t.Fatalf("stats after migration: %v %+v", err, stats)
	}
	if stats[0].CreditsExhaustedCount != 0 || stats[0].Value != nil {
		t.Errorf("migrated row defaults wrong: %+v", stats[0])
	}
	if stats[0].Weight != 2 || !stats[0].Enabled {
		t.Errorf("legacy row data lost: %+v", stats[0])
	}
}

func strPtr(v string) *string { return &v }
func int64Ptr(v int64) *int64 { return &v }

func TestSeedKeysUpsertSemantics(t *testing.T) {
	st := newTestStore(t)
	value := "encrypted-blob"
	if err := st.SeedKeys([]KeySeed{{ID: "a", Value: &value, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	// Re-seed with nil value: weight syncs, stored value is preserved.
	if err := st.SeedKeys([]KeySeed{{ID: "a", Weight: 5, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	stats, err := st.ListKeyStats()
	if err != nil || len(stats) != 1 {
		t.Fatalf("stats: %v %+v", err, stats)
	}
	if stats[0].Weight != 5 {
		t.Errorf("weight not synced: %+v", stats[0])
	}
	if stats[0].Value == nil || *stats[0].Value != value {
		t.Errorf("value not preserved on nil re-seed: %+v", stats[0].Value)
	}
	// Re-seed with a new value overwrites.
	value2 := "new-blob"
	if err := st.SeedKeys([]KeySeed{{ID: "a", Value: &value2, Weight: 6, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	got, _ := st.GetKeyValue("a")
	if got == nil || *got != value2 {
		t.Errorf("value not overwritten: %v", got)
	}
}

// recordAttemptFixture seeds key "k" and records four attempts:
// 200 ok, 429 retry, transport timeout, 402 credits_exhausted.
func recordAttemptFixture(t *testing.T) *Store {
	t.Helper()
	st := newTestStore(t)
	value := "v"
	if err := st.SeedKeys([]KeySeed{{ID: "k", Value: &value, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	attempts := []AttemptRecord{
		{KeyID: "k", Status: int64Ptr(200), Success: true, LatencyMs: 42.6, Reason: "ok"},
		{KeyID: "k", Status: int64Ptr(429), Success: false, LatencyMs: 10, Retry: true, Reason: "rate_limit"},
		{KeyID: "k", Success: false, LatencyMs: 5, Reason: "timeout"},
		{KeyID: "k", Status: int64Ptr(402), Success: false, LatencyMs: 7, Reason: "credits_exhausted"},
	}
	for _, a := range attempts {
		if err := st.RecordAttempt(a); err != nil {
			t.Fatal(err)
		}
	}
	return st
}

func TestRecordAttemptCounters(t *testing.T) {
	st := recordAttemptFixture(t)
	stats, err := st.ListKeyStats()
	if err != nil || len(stats) != 1 {
		t.Fatalf("stats: %v %+v", err, stats)
	}
	s := stats[0]
	if s.TotalRequests != 4 || s.SuccessCount != 1 || s.FailureCount != 3 || s.RetryCount != 1 {
		t.Errorf("counters: total=%d success=%d failure=%d retry=%d", s.TotalRequests, s.SuccessCount, s.FailureCount, s.RetryCount)
	}
	if s.RateLimitCount != 1 || s.TimeoutCount != 1 || s.CreditsExhaustedCount != 1 {
		t.Errorf("reason counters: rate=%d timeout=%d credits=%d", s.RateLimitCount, s.TimeoutCount, s.CreditsExhaustedCount)
	}
}

func TestRecordAttemptLatestFields(t *testing.T) {
	st := recordAttemptFixture(t)
	stats, _ := st.ListKeyStats()
	s := stats[0]
	if s.LastStatus == nil || *s.LastStatus != 402 {
		t.Errorf("last status = %v, want 402 (last attempt)", s.LastStatus)
	}
	if s.LastError == nil || *s.LastError != "credits_exhausted" {
		t.Errorf("last error = %v", s.LastError)
	}
	if s.LastLatencyMs == nil || *s.LastLatencyMs != 7 {
		t.Errorf("last latency = %v, want 7", s.LastLatencyMs)
	}
	if s.LastSuccessAt == nil {
		t.Error("last success at not recorded")
	}
	if s.LastFailureAt == nil {
		t.Error("last failure at not recorded")
	}
	// last_error reflects the latest attempt only: a success clears it.
	if err := st.RecordAttempt(AttemptRecord{KeyID: "k", Status: int64Ptr(200), Success: true, LatencyMs: 1, Reason: "ok"}); err != nil {
		t.Fatal(err)
	}
	stats, _ = st.ListKeyStats()
	if stats[0].LastError != nil {
		t.Errorf("last_error after success = %v, want nil", stats[0].LastError)
	}
	if stats[0].LastLatencyMs == nil || *stats[0].LastLatencyMs != 1 {
		t.Errorf("last latency after success = %v", stats[0].LastLatencyMs)
	}
}

func TestSetCooldownAndEnabled(t *testing.T) {
	st := newTestStore(t)
	if err := st.SeedKeys([]KeySeed{{ID: "k", Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	reason := "rate_limit"
	if err := st.SetCooldown("k", 9999, &reason); err != nil {
		t.Fatal(err)
	}
	if err := st.SetEnabled("k", false); err != nil {
		t.Fatal(err)
	}
	stats, _ := st.ListKeyStats()
	if stats[0].CooldownUntil != 9999 || stats[0].CooldownReason == nil || *stats[0].CooldownReason != "rate_limit" {
		t.Errorf("cooldown not persisted: %+v", stats[0])
	}
	if stats[0].Enabled {
		t.Error("enabled not persisted")
	}
	// Clearing cooldown with nil reason.
	if err := st.SetCooldown("k", 0, nil); err != nil {
		t.Fatal(err)
	}
	stats, _ = st.ListKeyStats()
	if stats[0].CooldownUntil != 0 || stats[0].CooldownReason != nil {
		t.Errorf("cooldown not cleared: %+v", stats[0])
	}
}

func TestAffinityLifecycle(t *testing.T) {
	st := newTestStore(t)
	if err := st.SetAffinity("webset", "w1", "key-a", 100); err != nil {
		t.Fatal(err)
	}
	if err := st.SetAffinity("webset", "w2", "key-b", 200); err != nil {
		t.Fatal(err)
	}
	keyID, err := st.GetAffinity("webset", "w1")
	if err != nil || keyID != "key-a" {
		t.Fatalf("GetAffinity = %q, %v", keyID, err)
	}
	// Upsert rebinds (and refreshes created_at).
	if err := st.SetAffinity("webset", "w1", "key-c", 300); err != nil {
		t.Fatal(err)
	}
	keyID, _ = st.GetAffinity("webset", "w1")
	if keyID != "key-c" {
		t.Errorf("affinity rebind = %q, want key-c", keyID)
	}
	if got, _ := st.GetAffinity("webset", "missing"); got != "" {
		t.Errorf("missing affinity = %q, want empty", got)
	}
	// Prune removes only rows older than the cutoff: w1 was rebound at 300,
	// w2 still sits at 200.
	n, err := st.PruneAffinity(250)
	if err != nil || n != 1 {
		t.Fatalf("PruneAffinity = %d, %v, want 1", n, err)
	}
	if got, _ := st.GetAffinity("webset", "w2"); got != "" {
		t.Errorf("w2 affinity survived prune: %q", got)
	}
	if got, _ := st.GetAffinity("webset", "w1"); got != "key-c" {
		t.Errorf("w1 affinity lost by prune: %q", got)
	}
}

func TestDeleteKeyRemovesAffinity(t *testing.T) {
	st := newTestStore(t)
	value := "v"
	if err := st.SeedKeys([]KeySeed{
		{ID: "gone", Value: &value, Weight: 1, Enabled: true},
		{ID: "stay", Value: &value, Weight: 1, Enabled: true},
	}); err != nil {
		t.Fatal(err)
	}
	if err := st.SetAffinity("webset", "w1", "gone", 100); err != nil {
		t.Fatal(err)
	}
	if err := st.SetAffinity("webset", "w2", "stay", 100); err != nil {
		t.Fatal(err)
	}
	if err := st.DeleteKey("gone"); err != nil {
		t.Fatal(err)
	}
	count, _ := st.KeyCount()
	if count != 1 {
		t.Errorf("KeyCount after delete = %d, want 1", count)
	}
	if got, _ := st.GetAffinity("webset", "w1"); got != "" {
		t.Errorf("affinity of deleted key survived: %q", got)
	}
	if got, _ := st.GetAffinity("webset", "w2"); got != "stay" {
		t.Errorf("affinity of surviving key lost: %q", got)
	}
	if v, err := st.GetKeyValue("gone"); v != nil || err != nil {
		t.Errorf("deleted key value = %v, %v", v, err)
	}
}

func TestListPersistentKeys(t *testing.T) {
	st := newTestStore(t)
	v1, v3 := "v1", "v3"
	if err := st.SeedKeys([]KeySeed{
		{ID: "a", Value: &v1, Weight: 1, Enabled: true},
		{ID: "b", Weight: 2, Enabled: true}, // stats-only row
		{ID: "c", Value: &v3, Weight: 3, Enabled: false},
	}); err != nil {
		t.Fatal(err)
	}
	keys, err := st.ListPersistentKeys()
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 2 {
		t.Fatalf("persistent keys = %+v, want 2", keys)
	}
	if keys[0].ID != "a" || keys[1].ID != "c" {
		t.Errorf("persistent keys order = %s,%s", keys[0].ID, keys[1].ID)
	}
	if keys[1].Enabled {
		t.Error("enabled flag not restored")
	}
}

// requestLogsFixture records three logs: r1 /search 200 (k1,k2), r2 /search
// 429 (k1) with error rate_limit, r3 /contents 200 with a query.
func requestLogsFixture(t *testing.T) (*Store, int64) {
	t.Helper()
	st := newTestStore(t)
	base := time.Now().Add(-time.Hour).UnixMilli()
	logs := []RequestLog{
		{RequestID: "r1", TokenID: strPtr("tok1"), Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"a", "b"}, Attempts: 1, LatencyMs: 30, CreatedAt: base},
		{RequestID: "r2", Method: "POST", Path: "/search", Status: 429, KeyIDs: []string{"a"}, Attempts: 2, LatencyMs: 50, ErrorCode: strPtr("rate_limit"), CreatedAt: base + 1000},
		{RequestID: "r3", Method: "GET", Path: "/contents", Status: 200, KeyIDs: nil, Attempts: 0, LatencyMs: 5, Query: strPtr("test query"), CreatedAt: base + 2000},
	}
	for _, l := range logs {
		if err := st.RecordRequestLog(l); err != nil {
			t.Fatal(err)
		}
	}
	return st, base
}

func TestRequestLogsRoundTripAndOrder(t *testing.T) {
	st, _ := requestLogsFixture(t)
	all, err := st.ListRequestLogs(LogFilter{From: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Fatalf("logs = %d, want 3", len(all))
	}
	// Newest first.
	if all[0].RequestID != "r3" || all[2].RequestID != "r1" {
		t.Errorf("order = %s,%s,%s", all[0].RequestID, all[1].RequestID, all[2].RequestID)
	}
	// JSON round trip of key ids and nullable fields.
	if len(all[2].KeyIDs) != 2 || all[2].KeyIDs[0] != "a" || all[2].KeyIDs[1] != "b" {
		t.Errorf("keyIds = %v", all[2].KeyIDs)
	}
	if all[0].TokenID != nil {
		t.Errorf("r3 token = %v, want nil", all[0].TokenID)
	}
	if all[0].Query == nil || *all[0].Query != "test query" {
		t.Errorf("r3 query = %v", all[0].Query)
	}
}

func TestRequestLogsFilters(t *testing.T) {
	st, base := requestLogsFixture(t)

	byPath, _ := st.ListRequestLogs(LogFilter{From: 0, Path: "/search"})
	if len(byPath) != 2 {
		t.Errorf("path filter = %d, want 2", len(byPath))
	}
	byStatus, _ := st.ListRequestLogs(LogFilter{From: 0, Status: "429"})
	if len(byStatus) != 1 || byStatus[0].RequestID != "r2" {
		t.Errorf("status filter = %+v", byStatus)
	}
	byKey, _ := st.ListRequestLogs(LogFilter{From: 0, KeyID: "b"})
	if len(byKey) != 1 || byKey[0].RequestID != "r1" {
		t.Errorf("key filter = %+v", byKey)
	}
	limited, _ := st.ListRequestLogs(LogFilter{From: 0, Limit: 1})
	if len(limited) != 1 {
		t.Errorf("limit = %d, want 1", len(limited))
	}
	recentOnly, _ := st.ListRequestLogs(LogFilter{From: base + 1500})
	if len(recentOnly) != 1 || recentOnly[0].RequestID != "r3" {
		t.Errorf("from filter = %+v", recentOnly)
	}

	byRequest, err := st.ListLogsByRequestID("r2")
	if err != nil || len(byRequest) != 1 || byRequest[0].ErrorCode == nil || *byRequest[0].ErrorCode != "rate_limit" {
		t.Errorf("by request id = %+v, %v", byRequest, err)
	}
}

func TestPruneLogs(t *testing.T) {
	st := newTestStore(t)
	now := time.Now().UnixMilli()
	if err := st.RecordRequestLog(RequestLog{RequestID: "old", Method: "GET", Path: "/", Status: 200, CreatedAt: now - 10000}); err != nil {
		t.Fatal(err)
	}
	if err := st.RecordRequestLog(RequestLog{RequestID: "new", Method: "GET", Path: "/", Status: 200, CreatedAt: now}); err != nil {
		t.Fatal(err)
	}
	n, err := st.PruneLogs(now - 5000)
	if err != nil || n != 1 {
		t.Fatalf("PruneLogs = %d, %v", n, err)
	}
	logs, _ := st.ListRequestLogs(LogFilter{From: 0})
	if len(logs) != 1 || logs[0].RequestID != "new" {
		t.Errorf("remaining = %+v", logs)
	}
}

func TestAuditLifecycle(t *testing.T) {
	st := newTestStore(t)
	if err := st.RecordAudit(AuditRecord{ActorTokenID: strPtr("tok"), Action: "key_create", TargetID: strPtr("k1"), Success: true, Detail: strPtr("d"), IP: strPtr("1.2.3.4"), UserAgent: strPtr("ua")}); err != nil {
		t.Fatal(err)
	}
	if err := st.RecordAudit(AuditRecord{Action: "admin_login", Success: false, IP: strPtr("5.6.7.8")}); err != nil {
		t.Fatal(err)
	}
	if err := st.RecordAudit(AuditRecord{Action: "admin_login", Success: false, IP: strPtr("5.6.7.8")}); err != nil {
		t.Fatal(err)
	}

	records, total, err := st.ListAudit(10)
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 {
		t.Errorf("total = %d, want 3", total)
	}
	if len(records) != 3 {
		t.Fatalf("records = %d, want 3", len(records))
	}
	if records[0].Action != "admin_login" || records[0].Success {
		t.Errorf("newest record wrong: %+v", records[0])
	}
	if records[2].ActorTokenID == nil || *records[2].ActorTokenID != "tok" {
		t.Errorf("oldest actor = %v", records[2].ActorTokenID)
	}

	limited, total2, _ := st.ListAudit(1)
	if len(limited) != 1 || total2 != 3 {
		t.Errorf("limited = %d/%d, want 1/3", len(limited), total2)
	}

	since := time.Now().Add(-time.Minute).UnixMilli()
	failed, err := st.CountFailedAdminLogins(since)
	if err != nil || failed != 2 {
		t.Errorf("CountFailedAdminLogins = %d, %v, want 2", failed, err)
	}
	failedOld, _ := st.CountFailedAdminLogins(time.Now().Add(time.Minute).UnixMilli())
	if failedOld != 0 {
		t.Errorf("future since = %d, want 0", failedOld)
	}
}

func TestSessionLifecycle(t *testing.T) {
	st := newTestStore(t)
	now := time.Now().UnixMilli()
	sessions := []AdminSession{
		{ID: "s1", TokenID: "tok", CreatedAt: now, ExpiresAt: now + 1000, LastSeenAt: now},
		{ID: "s2", TokenID: "tok", CreatedAt: now, ExpiresAt: now + 5000, LastSeenAt: now + 100},
		{ID: "expired", TokenID: "tok", CreatedAt: now - 2000, ExpiresAt: now - 1000, LastSeenAt: now - 2000},
	}
	for _, s := range sessions {
		if err := st.CreateSession(s); err != nil {
			t.Fatal(err)
		}
	}
	got, err := st.GetSession("s1")
	if err != nil || got.TokenID != "tok" || got.ExpiresAt != now+1000 {
		t.Fatalf("GetSession = %+v, %v", got, err)
	}
	if _, err := st.GetSession("missing"); err == nil {
		t.Error("missing session should error")
	}
	if err := st.TouchSession("s1", now+500); err != nil {
		t.Fatal(err)
	}
	got, _ = st.GetSession("s1")
	if got.LastSeenAt != now+500 {
		t.Errorf("touch = %d, want %d", got.LastSeenAt, now+500)
	}
	active, err := st.ListActiveSessions(now)
	if err != nil || len(active) != 2 {
		t.Fatalf("active = %d, %v, want 2", len(active), err)
	}
	// Ordered by last_seen desc: s2 (now+100) before touched s1 (now+500)?
	// s1 was touched to now+500 which is after s2's now+100.
	if active[0].ID != "s1" || active[1].ID != "s2" {
		t.Errorf("active order = %s,%s", active[0].ID, active[1].ID)
	}
	if err := st.PruneSessions(now); err != nil {
		t.Fatal(err)
	}
	active, _ = st.ListActiveSessions(now)
	if len(active) != 2 {
		t.Errorf("after prune active = %d, want 2 (expired one removed)", len(active))
	}
	if _, err := st.GetSession("expired"); err == nil {
		t.Error("expired session should be pruned")
	}
	if err := st.DeleteSession("s1"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.GetSession("s1"); err == nil {
		t.Error("deleted session should be gone")
	}
}

func TestHourlyCountsAggregation(t *testing.T) {
	st := newTestStore(t)
	hour := time.Now().Truncate(time.Hour).UnixMilli()
	rows := []RequestLog{
		// Normal requests in the same hour.
		{RequestID: "a", Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 100, CreatedAt: hour},
		{RequestID: "b", Method: "POST", Path: "/search", Status: 429, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 300, ErrorCode: strPtr("rate_limit"), CreatedAt: hour + 1},
		{RequestID: "c", Method: "POST", Path: "/search", Status: 500, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 200, CreatedAt: hour + 2},
		// Probe noise: unauthorized with no key chain — excluded.
		{RequestID: "noise1", Method: "GET", Path: "/search", Status: 401, KeyIDs: nil, Attempts: 0, LatencyMs: 1, ErrorCode: strPtr("unauthorized"), CreatedAt: hour + 3},
		// 401 WITH a key chain — counted (real request that failed auth upstream).
		{RequestID: "real401", Method: "POST", Path: "/search", Status: 401, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 50, CreatedAt: hour + 4},
	}
	for _, r := range rows {
		if err := st.RecordRequestLog(r); err != nil {
			t.Fatal(err)
		}
	}
	counts, err := st.HourlyCounts(hour - 1000)
	if err != nil {
		t.Fatal(err)
	}
	if len(counts) != 1 {
		t.Fatalf("counts = %d buckets, want 1", len(counts))
	}
	hc := counts[0]
	if hc.Requests != 4 {
		t.Errorf("requests = %d, want 4 (probe noise excluded)", hc.Requests)
	}
	if hc.Failures != 3 {
		t.Errorf("failures = %d, want 3 (429, 500, 401-with-keys)", hc.Failures)
	}
	if hc.RateLimits != 1 {
		t.Errorf("rate limits = %d, want 1", hc.RateLimits)
	}
	// AVG(100, 300, 200, 50) = 162.5
	if hc.AvgLatency < 162 || hc.AvgLatency > 163 {
		t.Errorf("avg latency = %v, want ~162.5", hc.AvgLatency)
	}
	// Since filter in the future yields nothing.
	counts, _ = st.HourlyCounts(hour + 999999)
	if len(counts) != 0 {
		t.Errorf("future since = %d buckets, want 0", len(counts))
	}
}

func TestDeleteKeysBatch(t *testing.T) {
	st := newTestStore(t)
	v := "v"
	if err := st.SeedKeys([]KeySeed{
		{ID: "a", Value: &v, Weight: 1, Enabled: true},
		{ID: "b", Value: &v, Weight: 1, Enabled: true},
		{ID: "c", Value: &v, Weight: 1, Enabled: true},
	}); err != nil {
		t.Fatal(err)
	}
	// Affinity rows whose key_id matches a deleted key are removed.
	if err := st.SetAffinity("webset", "w1", "a", 100); err != nil {
		t.Fatal(err)
	}
	if err := st.SetAffinity("webset", "w2", "b", 100); err != nil {
		t.Fatal(err)
	}
	n, err := st.SeedKeysBatch([]KeySeed{{ID: "d", Value: &v, Weight: 1, Enabled: true}, {ID: "e", Weight: 2, Enabled: true}})
	if err != nil || n != 2 {
		t.Fatalf("SeedKeysBatch = %d, %v", n, err)
	}
	if err := st.DeleteKeysBatch([]string{"a", "b", "d"}); err != nil {
		t.Fatal(err)
	}
	count, _ := st.KeyCount()
	if count != 2 {
		t.Errorf("KeyCount = %d, want 2", count)
	}
	if got, _ := st.GetAffinity("webset", "a"); got != "" {
		t.Errorf("affinity of batch-deleted key survived: %q", got)
	}
	if got, _ := st.GetAffinity("webset", "b"); got != "" {
		t.Errorf("affinity of batch-deleted key survived: %q", got)
	}
}

func TestListKeyFailureLogs(t *testing.T) {
	st := newTestStore(t)
	now := time.Now().UnixMilli()
	rows := []RequestLog{
		{RequestID: "ok", Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 10, CreatedAt: now},
		{RequestID: "fail1", Method: "POST", Path: "/search", Status: 500, KeyIDs: []string{"k", "other"}, Attempts: 2, LatencyMs: 20, CreatedAt: now + 1},
		{RequestID: "fail2", Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 20, ErrorCode: strPtr("upstream_error"), CreatedAt: now + 2},
		{RequestID: "other-key", Method: "POST", Path: "/search", Status: 500, KeyIDs: []string{"z"}, Attempts: 1, LatencyMs: 20, CreatedAt: now + 3},
	}
	for _, r := range rows {
		if err := st.RecordRequestLog(r); err != nil {
			t.Fatal(err)
		}
	}
	logs, err := st.ListKeyFailureLogs("k", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 2 {
		t.Fatalf("failure logs = %d, want 2", len(logs))
	}
	// Newest first.
	if logs[0].RequestID != "fail2" || logs[1].RequestID != "fail1" {
		t.Errorf("order = %s,%s", logs[0].RequestID, logs[1].RequestID)
	}
	limited, _ := st.ListKeyFailureLogs("k", 1)
	if len(limited) != 1 || limited[0].RequestID != "fail2" {
		t.Errorf("limited = %+v", limited)
	}
}

func TestSeedKeysBatchConflictPreservesValue(t *testing.T) {
	st := newTestStore(t)
	v1, v2 := "v1", "v2"
	if _, err := st.SeedKeysBatch([]KeySeed{{ID: "a", Value: &v1, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	// Batch re-seed with nil value must not wipe the stored value, and —
	// matching the TypeScript upsert — enabled is NOT overwritten on conflict.
	if _, err := st.SeedKeysBatch([]KeySeed{{ID: "a", Weight: 9, Enabled: false}}); err != nil {
		t.Fatal(err)
	}
	got, _ := st.GetKeyValue("a")
	if got == nil || *got != v1 {
		t.Errorf("value wiped by batch re-seed: %v", got)
	}
	stats, _ := st.ListKeyStats()
	if stats[0].Weight != 9 {
		t.Errorf("weight not synced: %+v", stats[0])
	}
	if !stats[0].Enabled {
		t.Errorf("enabled should stay true on conflict (DB is source of truth): %+v", stats[0])
	}
	// Explicit value in batch overwrites.
	if _, err := st.SeedKeysBatch([]KeySeed{{ID: "a", Value: &v2, Weight: 1, Enabled: true}}); err != nil {
		t.Fatal(err)
	}
	got, _ = st.GetKeyValue("a")
	if got == nil || *got != v2 {
		t.Errorf("batch value overwrite failed: %v", got)
	}
}

func TestHourlyCountsExcludesLegacyNullKeyIDs(t *testing.T) {
	st := newTestStore(t)
	hour := time.Now().Truncate(time.Hour).UnixMilli()
	// Rows written before the nil-normalization fix stored JSON "null".
	if err := st.RecordRequestLog(RequestLog{RequestID: "legacy-noise", Method: "GET", Path: "/search", Status: 401, Attempts: 0, LatencyMs: 1, ErrorCode: strPtr("unauthorized"), CreatedAt: hour}); err != nil {
		t.Fatal(err)
	}
	// Overwrite the stored JSON with the legacy "null" form.
	if _, err := st.DB().Exec("UPDATE request_logs SET key_ids_json = 'null' WHERE request_id = 'legacy-noise'"); err != nil {
		t.Fatal(err)
	}
	if err := st.RecordRequestLog(RequestLog{RequestID: "real", Method: "POST", Path: "/search", Status: 200, KeyIDs: []string{"k"}, Attempts: 1, LatencyMs: 10, CreatedAt: hour + 1}); err != nil {
		t.Fatal(err)
	}
	counts, err := st.HourlyCounts(hour - 1000)
	if err != nil {
		t.Fatal(err)
	}
	if len(counts) != 1 || counts[0].Requests != 1 {
		t.Fatalf("counts = %+v, want 1 real request (legacy null-noise excluded)", counts)
	}
}

// TestClosedStoreMethodsReturnErrors exercises the error-return path of every
// Store method by closing the underlying database first.
func TestClosedStoreMethodsReturnErrors(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "closed.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Close(); err != nil {
		t.Fatal(err)
	}

	value := "v"
	reason := "rate_limit"
	now := time.Now().UnixMilli()
	checks := map[string]func(*testing.T){
		"SeedKeys": func(t *testing.T) {
			if err := st.SeedKeys([]KeySeed{{ID: "a", Weight: 1, Enabled: true}}); err == nil {
				t.Error("want error")
			}
		},
		"RecordAttempt": func(t *testing.T) {
			if err := st.RecordAttempt(AttemptRecord{KeyID: "a", Success: true}); err == nil {
				t.Error("want error")
			}
		},
		"SetCooldown": func(t *testing.T) {
			if err := st.SetCooldown("a", 1, &reason); err == nil {
				t.Error("want error")
			}
		},
		"SetEnabled": func(t *testing.T) {
			if err := st.SetEnabled("a", false); err == nil {
				t.Error("want error")
			}
		},
		"ListKeyStats": func(t *testing.T) {
			if _, err := st.ListKeyStats(); err == nil {
				t.Error("want error")
			}
		},
		"GetKeyValue": func(t *testing.T) {
			if _, err := st.GetKeyValue("a"); err == nil {
				t.Error("want error")
			}
		},
		"ListPersistentKeys": func(t *testing.T) {
			if _, err := st.ListPersistentKeys(); err == nil {
				t.Error("want error")
			}
		},
		"KeyCount": func(t *testing.T) {
			if _, err := st.KeyCount(); err == nil {
				t.Error("want error")
			}
		},
		"DeleteKey": func(t *testing.T) {
			if err := st.DeleteKey("a"); err == nil {
				t.Error("want error")
			}
		},
		"SetAffinity": func(t *testing.T) {
			if err := st.SetAffinity("webset", "w", "a", 1); err == nil {
				t.Error("want error")
			}
		},
		"GetAffinity": func(t *testing.T) {
			if _, err := st.GetAffinity("webset", "w"); err == nil {
				t.Error("want error")
			}
		},
		"PruneAffinity": func(t *testing.T) {
			if _, err := st.PruneAffinity(1); err == nil {
				t.Error("want error")
			}
		},
		"RecordRequestLog": func(t *testing.T) {
			if err := st.RecordRequestLog(RequestLog{RequestID: "r", Method: "GET", Path: "/", Status: 200, CreatedAt: now}); err == nil {
				t.Error("want error")
			}
		},
		"ListRequestLogs": func(t *testing.T) {
			if _, err := st.ListRequestLogs(LogFilter{From: 0}); err == nil {
				t.Error("want error")
			}
		},
		"ListLogsByRequestID": func(t *testing.T) {
			if _, err := st.ListLogsByRequestID("r"); err == nil {
				t.Error("want error")
			}
		},
		"PruneLogs": func(t *testing.T) {
			if _, err := st.PruneLogs(1); err == nil {
				t.Error("want error")
			}
		},
		"RecordAudit": func(t *testing.T) {
			if err := st.RecordAudit(AuditRecord{Action: "x", Success: true}); err == nil {
				t.Error("want error")
			}
		},
		"ListAudit": func(t *testing.T) {
			if _, _, err := st.ListAudit(10); err == nil {
				t.Error("want error")
			}
		},
		"CreateSession": func(t *testing.T) {
			if err := st.CreateSession(AdminSession{ID: "s", TokenID: "t", CreatedAt: now, ExpiresAt: now, LastSeenAt: now}); err == nil {
				t.Error("want error")
			}
		},
		"GetSession": func(t *testing.T) {
			if _, err := st.GetSession("s"); err == nil {
				t.Error("want error")
			}
		},
		"TouchSession": func(t *testing.T) {
			if err := st.TouchSession("s", now); err == nil {
				t.Error("want error")
			}
		},
		"DeleteSession": func(t *testing.T) {
			if err := st.DeleteSession("s"); err == nil {
				t.Error("want error")
			}
		},
		"ListActiveSessions": func(t *testing.T) {
			if _, err := st.ListActiveSessions(now); err == nil {
				t.Error("want error")
			}
		},
		"PruneSessions": func(t *testing.T) {
			if err := st.PruneSessions(now); err == nil {
				t.Error("want error")
			}
		},
		"CountFailedAdminLogins": func(t *testing.T) {
			if _, err := st.CountFailedAdminLogins(0); err == nil {
				t.Error("want error")
			}
		},
		"HourlyCounts": func(t *testing.T) {
			if _, err := st.HourlyCounts(0); err == nil {
				t.Error("want error")
			}
		},
		"DeleteKeysBatch": func(t *testing.T) {
			if err := st.DeleteKeysBatch([]string{"a"}); err == nil {
				t.Error("want error")
			}
		},
		"ListKeyFailureLogs": func(t *testing.T) {
			if _, err := st.ListKeyFailureLogs("a", 10); err == nil {
				t.Error("want error")
			}
		},
		"SeedKeysBatch": func(t *testing.T) {
			if _, err := st.SeedKeysBatch([]KeySeed{{ID: "a", Value: &value, Weight: 1, Enabled: true}}); err == nil {
				t.Error("want error")
			}
		},
	}
	for name, check := range checks {
		t.Run(name, check)
	}
}

func TestOpenFailurePaths(t *testing.T) {
	// State path whose parent is a file: MkdirAll fails.
	dir := t.TempDir()
	blocker := filepath.Join(dir, "not-a-dir")
	if err := os.WriteFile(blocker, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(filepath.Join(blocker, "gate.sqlite")); err == nil {
		t.Error("Open with file-as-parent should fail")
	}

	// Path is an existing DIRECTORY: opening the pragma fails.
	sub := filepath.Join(dir, "as-dir")
	if err := os.MkdirAll(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(sub); err == nil {
		t.Error("Open on a directory should fail")
	}
}
