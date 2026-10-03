// Package state is the SQLite persistence layer. The schema, pragmas and
// row semantics are byte-compatible with the TypeScript implementation:
// databases created by either runtime are interchangeable.
package state

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type AttemptRecord struct {
	KeyID     string
	Status    *int64 // nil = transport failure (no HTTP status)
	Success   bool
	LatencyMs float64
	Retry     bool
	Reason    string
}

type KeyStats struct {
	ID                    string  `json:"id"`
	Enabled               bool    `json:"enabled"`
	Weight                int     `json:"weight"`
	Value                 *string `json:"value,omitempty"`
	TotalRequests         int64   `json:"totalRequests"`
	SuccessCount          int64   `json:"successCount"`
	FailureCount          int64   `json:"failureCount"`
	RetryCount            int64   `json:"retryCount"`
	RateLimitCount        int64   `json:"rateLimitCount"`
	TimeoutCount          int64   `json:"timeoutCount"`
	CreditsExhaustedCount int64   `json:"creditsExhaustedCount"`
	CooldownUntil         int64   `json:"cooldownUntil"`
	CooldownReason        *string `json:"cooldownReason"`
	LastStatus            *int64  `json:"lastStatus"`
	LastError             *string `json:"lastError"`
	LastLatencyMs         *int64  `json:"lastLatencyMs"`
	LastSuccessAt         *int64  `json:"lastSuccessAt"`
	LastFailureAt         *int64  `json:"lastFailureAt"`
}

type RequestLog struct {
	ID        int64    `json:"id"`
	RequestID string   `json:"requestId"`
	TokenID   *string  `json:"tokenId"`
	Method    string   `json:"method"`
	Path      string   `json:"path"`
	Status    int64    `json:"status"`
	KeyIDs    []string `json:"keyIds"`
	Attempts  int64    `json:"attempts"`
	LatencyMs int64    `json:"latencyMs"`
	ErrorCode *string  `json:"errorCode"`
	Query     *string  `json:"query"`
	CreatedAt int64    `json:"createdAt"`
}

type AuditRecord struct {
	ActorTokenID *string `json:"actorTokenId"`
	Action       string  `json:"action"`
	TargetID     *string `json:"targetId"`
	Success      bool    `json:"success"`
	Detail       *string `json:"detail"`
	IP           *string `json:"ip"`
	UserAgent    *string `json:"userAgent"`
	CreatedAt    int64   `json:"createdAt"`
}

type AdminSession struct {
	ID         string `json:"id"`
	TokenID    string `json:"tokenId"`
	CreatedAt  int64  `json:"createdAt"`
	ExpiresAt  int64  `json:"expiresAt"`
	LastSeenAt int64  `json:"lastSeenAt"`
}

type KeySeed struct {
	ID      string
	Value   *string // encrypted value (nil = seed stats row only)
	Weight  int
	Enabled bool
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// Same pragmas as the TypeScript openDatabase.
	for _, pragma := range []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL",
		"PRAGMA busy_timeout = 5000",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("pragma %q: %w", pragma, err)
		}
	}
	// SQLite accepts one writer at a time; a single connection avoids
	// SQLITE_BUSY churn while keeping reads serialized behind it.
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if err := store.applySchema(); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) applySchema() error {
	_, err := s.db.Exec(`
    CREATE TABLE IF NOT EXISTS key_stats (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      weight INTEGER NOT NULL,
      total_requests INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      rate_limit_count INTEGER NOT NULL DEFAULT 0,
      timeout_count INTEGER NOT NULL DEFAULT 0,
      cooldown_until INTEGER NOT NULL DEFAULT 0,
      cooldown_reason TEXT,
      last_status INTEGER,
      last_error TEXT,
      last_latency_ms INTEGER,
      last_success_at INTEGER,
      last_failure_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS resource_affinity (
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (resource_type, resource_id)
    );
    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      token_id TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      key_ids_json TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      error_code TEXT,
      query TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_token_id TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      success INTEGER NOT NULL,
      detail TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS request_logs_created_at_idx ON request_logs(created_at);
    CREATE INDEX IF NOT EXISTS request_logs_request_id_idx ON request_logs(request_id);
    CREATE INDEX IF NOT EXISTS request_logs_status_idx ON request_logs(status);
    CREATE INDEX IF NOT EXISTS request_logs_path_idx ON request_logs(path);
    CREATE INDEX IF NOT EXISTS request_logs_error_code_idx ON request_logs(error_code);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx ON admin_audit_logs(actor_token_id);
    CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS resource_affinity_created_at_idx ON resource_affinity(created_at);
`)
	if err != nil {
		return err
	}
	// Column migrations matching the TypeScript applySchema.
	var hasCreditsExhausted, hasValue, hasQuery bool
	rows, err := s.db.Query("PRAGMA table_info(key_stats)")
	if err != nil {
		return err
	}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notNull int
		var dfltValue any
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &dfltValue, &pk); err != nil {
			rows.Close()
			return err
		}
		switch name {
		case "credits_exhausted_count":
			hasCreditsExhausted = true
		case "value":
			hasValue = true
		}
	}
	rows.Close()
	if !hasCreditsExhausted {
		if _, err := s.db.Exec("ALTER TABLE key_stats ADD COLUMN credits_exhausted_count INTEGER NOT NULL DEFAULT 0"); err != nil {
			return err
		}
	}
	if !hasValue {
		if _, err := s.db.Exec("ALTER TABLE key_stats ADD COLUMN value TEXT"); err != nil {
			return err
		}
	}
	logRows, err := s.db.Query("PRAGMA table_info(request_logs)")
	if err != nil {
		return err
	}
	for logRows.Next() {
		var cid int
		var name, ctype string
		var notNull int
		var dfltValue any
		var pk int
		if err := logRows.Scan(&cid, &name, &ctype, &notNull, &dfltValue, &pk); err != nil {
			logRows.Close()
			return err
		}
		if name == "query" {
			hasQuery = true
		}
	}
	logRows.Close()
	if !hasQuery {
		if _, err := s.db.Exec("ALTER TABLE request_logs ADD COLUMN query TEXT"); err != nil {
			return err
		}
	}
	return nil
}

// SeedKeys mirrors createKeysStore initialization: DB is source of truth,
// existing rows are never deleted, only weight/enabled are synced.
func (s *Store) SeedKeys(keys []KeySeed) error {
	for _, key := range keys {
		if key.Value != nil {
			_, err := s.db.Exec(`
        INSERT INTO key_stats (id, enabled, weight, value)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET weight = excluded.weight, value = COALESCE(excluded.value, key_stats.value)`,
				key.ID, boolInt(key.Enabled), key.Weight, key.Value)
			if err != nil {
				return err
			}
			continue
		}
		_, err := s.db.Exec(`
      INSERT INTO key_stats (id, enabled, weight)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET weight = excluded.weight`,
			key.ID, boolInt(key.Enabled), key.Weight)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) RecordAttempt(record AttemptRecord) error {
	now := time.Now().UnixMilli()
	success := boolInt(record.Success)
	failure := 1 - success
	retry := boolInt(record.Retry)
	rateLimit := boolInt(record.Reason == "rate_limit")
	timeout := boolInt(record.Reason == "timeout")
	creditsExhausted := boolInt(record.Reason == "credits_exhausted")
	var status any
	if record.Status != nil {
		status = *record.Status
	}
	var lastError any
	if record.Success {
		lastError = nil
	} else {
		lastError = record.Reason
	}
	_, err := s.db.Exec(`
    UPDATE key_stats SET
      total_requests = total_requests + 1,
      success_count = success_count + ?,
      failure_count = failure_count + ?,
      retry_count = retry_count + ?,
      rate_limit_count = rate_limit_count + ?,
      timeout_count = timeout_count + ?,
      credits_exhausted_count = credits_exhausted_count + ?,
      last_status = ?,
      last_error = ?,
      last_latency_ms = ?,
      last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END,
      last_failure_at = CASE WHEN ? = 1 THEN ? ELSE last_failure_at END
    WHERE id = ?`,
		success, failure, retry, rateLimit, timeout, creditsExhausted,
		status, lastError, int64(record.LatencyMs+0.5), success, now, failure, now, record.KeyID)
	return err
}

func (s *Store) SetCooldown(keyID string, untilMs int64, reason *string) error {
	_, err := s.db.Exec("UPDATE key_stats SET cooldown_until = ?, cooldown_reason = ? WHERE id = ?", untilMs, reason, keyID)
	return err
}

func (s *Store) SetEnabled(keyID string, enabled bool) error {
	_, err := s.db.Exec("UPDATE key_stats SET enabled = ? WHERE id = ?", boolInt(enabled), keyID)
	return err
}

func scanKeyStats(scan func(dest ...any) error) (KeyStats, error) {
	var stat KeyStats
	var enabled int
	var cooldownReason, lastError *string
	var lastStatus, lastLatencyMs, lastSuccessAt, lastFailureAt *int64
	var creditsExhausted sql.NullInt64
	err := scan(&stat.ID, &enabled, &stat.Weight, &stat.TotalRequests, &stat.SuccessCount, &stat.FailureCount,
		&stat.RetryCount, &stat.RateLimitCount, &stat.TimeoutCount, &stat.CooldownUntil, &cooldownReason,
		&lastStatus, &lastError, &lastLatencyMs, &lastSuccessAt, &lastFailureAt, &creditsExhausted, &stat.Value)
	if err != nil {
		return stat, err
	}
	stat.Enabled = enabled != 0
	stat.CooldownReason = cooldownReason
	stat.LastStatus = lastStatus
	stat.LastError = lastError
	stat.LastLatencyMs = lastLatencyMs
	stat.LastSuccessAt = lastSuccessAt
	stat.LastFailureAt = lastFailureAt
	stat.CreditsExhaustedCount = creditsExhausted.Int64
	return stat, nil
}

const keyStatsColumns = "id, enabled, weight, total_requests, success_count, failure_count, retry_count, rate_limit_count, timeout_count, cooldown_until, cooldown_reason, last_status, last_error, last_latency_ms, last_success_at, last_failure_at, credits_exhausted_count, value"

func (s *Store) ListKeyStats() ([]KeyStats, error) {
	rows, err := s.db.Query("SELECT " + keyStatsColumns + " FROM key_stats ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KeyStats
	for rows.Next() {
		stat, err := scanKeyStats(rows.Scan)
		if err != nil {
			return nil, err
		}
		out = append(out, stat)
	}
	return out, rows.Err()
}

func (s *Store) GetKeyValue(keyID string) (*string, error) {
	var value *string
	err := s.db.QueryRow("SELECT value FROM key_stats WHERE id = ?", keyID).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return value, err
}

func (s *Store) ListPersistentKeys() ([]KeySeed, error) {
	rows, err := s.db.Query("SELECT id, value, weight, enabled FROM key_stats WHERE value IS NOT NULL ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []KeySeed
	for rows.Next() {
		var key KeySeed
		var value *string
		var enabled int
		if err := rows.Scan(&key.ID, &value, &key.Weight, &enabled); err != nil {
			return nil, err
		}
		key.Value = value
		key.Enabled = enabled != 0
		out = append(out, key)
	}
	return out, rows.Err()
}

func (s *Store) KeyCount() (int64, error) {
	var count int64
	err := s.db.QueryRow("SELECT COUNT(*) FROM key_stats").Scan(&count)
	return count, err
}

func (s *Store) DeleteKey(keyID string) error {
	if _, err := s.db.Exec("DELETE FROM key_stats WHERE id = ?", keyID); err != nil {
		return err
	}
	_, err := s.db.Exec("DELETE FROM resource_affinity WHERE key_id = ?", keyID)
	return err
}

func (s *Store) SetAffinity(resourceType, resourceID, keyID string, now int64) error {
	_, err := s.db.Exec(`
    INSERT INTO resource_affinity (resource_type, resource_id, key_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(resource_type, resource_id) DO UPDATE SET key_id = excluded.key_id, created_at = excluded.created_at`,
		resourceType, resourceID, keyID, now)
	return err
}

func (s *Store) GetAffinity(resourceType, resourceID string) (string, error) {
	var keyID string
	err := s.db.QueryRow("SELECT key_id FROM resource_affinity WHERE resource_type = ? AND resource_id = ?", resourceType, resourceID).Scan(&keyID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return keyID, err
}

func (s *Store) PruneAffinity(before int64) (int64, error) {
	result, err := s.db.Exec("DELETE FROM resource_affinity WHERE created_at < ?", before)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Store) RecordRequestLog(record RequestLog) error {
	keyIDs, err := json.Marshal(record.KeyIDs)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
    INSERT INTO request_logs (request_id, token_id, method, path, status, key_ids_json, attempts, latency_ms, error_code, query, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		record.RequestID, record.TokenID, record.Method, record.Path, record.Status,
		string(keyIDs), record.Attempts, record.LatencyMs, record.ErrorCode, record.Query, record.CreatedAt)
	return err
}

type LogFilter struct {
	Limit  int64
	Path   string
	Status string
	KeyID  string
	From   int64
}

func (s *Store) ListRequestLogs(filter LogFilter) ([]RequestLog, error) {
	if filter.Limit <= 0 {
		filter.Limit = 100
	}
	query := "SELECT id, request_id, token_id, method, path, status, key_ids_json, attempts, latency_ms, error_code, query, created_at FROM request_logs WHERE created_at >= ?"
	args := []any{filter.From}
	if filter.Path != "" {
		query += " AND path = ?"
		args = append(args, filter.Path)
	}
	if filter.Status != "" {
		query += " AND status = ?"
		args = append(args, filter.Status)
	}
	if filter.KeyID != "" {
		query += " AND key_ids_json LIKE ?"
		args = append(args, "%\""+filter.KeyID+"\"%")
	}
	query += " ORDER BY created_at DESC, id DESC LIMIT ?"
	args = append(args, filter.Limit)
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RequestLog
	for rows.Next() {
		var log RequestLog
		var tokenID, errorCode, queryText *string
		var keyIDsJSON string
		if err := rows.Scan(&log.ID, &log.RequestID, &tokenID, &log.Method, &log.Path, &log.Status,
			&keyIDsJSON, &log.Attempts, &log.LatencyMs, &errorCode, &queryText, &log.CreatedAt); err != nil {
			return nil, err
		}
		log.TokenID = tokenID
		log.ErrorCode = errorCode
		log.Query = queryText
		_ = json.Unmarshal([]byte(keyIDsJSON), &log.KeyIDs)
		out = append(out, log)
	}
	return out, rows.Err()
}

func (s *Store) ListLogsByRequestID(requestID string) ([]RequestLog, error) {
	rows, err := s.db.Query(`SELECT id, request_id, token_id, method, path, status, key_ids_json, attempts, latency_ms, error_code, query, created_at
    FROM request_logs WHERE request_id = ? ORDER BY created_at ASC, id ASC`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RequestLog
	for rows.Next() {
		var log RequestLog
		var tokenID, errorCode, queryText *string
		var keyIDsJSON string
		if err := rows.Scan(&log.ID, &log.RequestID, &tokenID, &log.Method, &log.Path, &log.Status,
			&keyIDsJSON, &log.Attempts, &log.LatencyMs, &errorCode, &queryText, &log.CreatedAt); err != nil {
			return nil, err
		}
		log.TokenID = tokenID
		log.ErrorCode = errorCode
		log.Query = queryText
		_ = json.Unmarshal([]byte(keyIDsJSON), &log.KeyIDs)
		out = append(out, log)
	}
	return out, rows.Err()
}

func (s *Store) PruneLogs(before int64) (int64, error) {
	result, err := s.db.Exec("DELETE FROM request_logs WHERE created_at < ?", before)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Store) RecordAudit(record AuditRecord) error {
	now := time.Now().UnixMilli()
	_, err := s.db.Exec(`
    INSERT INTO admin_audit_logs (actor_token_id, action, target_id, success, detail, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		record.ActorTokenID, record.Action, record.TargetID, boolInt(record.Success),
		record.Detail, record.IP, record.UserAgent, now)
	return err
}

func (s *Store) ListAudit(limit int64) ([]AuditRecord, int64, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(`SELECT actor_token_id, action, target_id, success, detail, ip, user_agent, created_at
    FROM admin_audit_logs ORDER BY created_at DESC, id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, 0, err
	}
	var out []AuditRecord
	for rows.Next() {
		var record AuditRecord
		var actor, target, detail, ip, ua *string
		var success int
		if err := rows.Scan(&actor, &record.Action, &target, &success, &detail, &ip, &ua, &record.CreatedAt); err != nil {
			rows.Close()
			return nil, 0, err
		}
		record.ActorTokenID = actor
		record.TargetID = target
		record.Success = success != 0
		record.Detail = detail
		record.IP = ip
		record.UserAgent = ua
		out = append(out, record)
	}
	rows.Close()
	var total int64
	if err := s.db.QueryRow("SELECT COUNT(*) FROM admin_audit_logs").Scan(&total); err != nil {
		return out, 0, err
	}
	return out, total, rows.Err()
}

func (s *Store) CreateSession(session AdminSession) error {
	_, err := s.db.Exec(`INSERT INTO admin_sessions (id, token_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)`, session.ID, session.TokenID, session.CreatedAt, session.ExpiresAt, session.LastSeenAt)
	return err
}

func (s *Store) GetSession(id string) (AdminSession, error) {
	var session AdminSession
	err := s.db.QueryRow("SELECT id, token_id, created_at, expires_at, last_seen_at FROM admin_sessions WHERE id = ?", id).
		Scan(&session.ID, &session.TokenID, &session.CreatedAt, &session.ExpiresAt, &session.LastSeenAt)
	return session, err
}

func (s *Store) TouchSession(id string, lastSeenAt int64) error {
	_, err := s.db.Exec("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?", lastSeenAt, id)
	return err
}

func (s *Store) DeleteSession(id string) error {
	_, err := s.db.Exec("DELETE FROM admin_sessions WHERE id = ?", id)
	return err
}

func (s *Store) ListActiveSessions(now int64) ([]AdminSession, error) {
	rows, err := s.db.Query(`SELECT id, token_id, created_at, expires_at, last_seen_at
    FROM admin_sessions WHERE expires_at > ? ORDER BY last_seen_at DESC`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AdminSession
	for rows.Next() {
		var session AdminSession
		if err := rows.Scan(&session.ID, &session.TokenID, &session.CreatedAt, &session.ExpiresAt, &session.LastSeenAt); err != nil {
			return nil, err
		}
		out = append(out, session)
	}
	return out, rows.Err()
}

func (s *Store) PruneSessions(now int64) error {
	_, err := s.db.Exec("DELETE FROM admin_sessions WHERE expires_at <= ?", now)
	return err
}

// CountFailedAdminLogins supports the lockout window: failed login attempts
// are recorded as audit rows with action 'admin_login' and success = 0.
func (s *Store) CountFailedAdminLogins(since int64) (int64, error) {
	var count int64
	err := s.db.QueryRow(`SELECT COUNT(*) FROM admin_audit_logs
    WHERE action = 'admin_login' AND success = 0 AND created_at >= ?`, since).Scan(&count)
	return count, err
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

// DB exposes the raw handle for tests only.
func (s *Store) DB() *sql.DB { return s.db }
