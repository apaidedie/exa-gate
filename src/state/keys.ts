import type Database from 'better-sqlite3';
import type { KeyConfig } from '../app.js';
import { bool, type AttemptRecord, type KeyStats, type PersistentKey, type StateStore } from './types.js';

export type KeysStore = Pick<
  StateStore,
  | 'recordAttempt'
  | 'setCooldown'
  | 'setEnabled'
  | 'listKeyStats'
  | 'upsertKey'
  | 'deleteKey'
  | 'listPersistentKeys'
  | 'getKeyValue'
  | 'keyCount'
  | 'setAffinity'
  | 'getAffinity'
  | 'pruneAffinity'
>;

function keyStatsFromRow(row: any): KeyStats {
  return {
    id: row.id,
    enabled: bool(row.enabled),
    weight: row.weight,
    value: row.value ?? null,
    totalRequests: row.total_requests,
    successCount: row.success_count,
    failureCount: row.failure_count,
    retryCount: row.retry_count,
    rateLimitCount: row.rate_limit_count,
    timeoutCount: row.timeout_count,
    creditsExhaustedCount: row.credits_exhausted_count || 0,
    cooldownUntil: row.cooldown_until,
    cooldownReason: row.cooldown_reason,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastLatencyMs: row.last_latency_ms,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at
  };
}

export function createKeysStore(db: Database.Database, keys: KeyConfig[]): KeysStore {
  const stmtUpsertKey = db.prepare(`
    INSERT INTO key_stats (id, enabled, weight)
    VALUES (@id, @enabled, @weight)
    ON CONFLICT(id) DO UPDATE SET weight = excluded.weight
  `);
  const stmtUpsertKeyWithValue = db.prepare(`
    INSERT INTO key_stats (id, enabled, weight, value)
    VALUES (@id, @enabled, @weight, @value)
    ON CONFLICT(id) DO UPDATE SET weight = excluded.weight, value = COALESCE(excluded.value, key_stats.value)
  `);
  const stmtDeleteKey = db.prepare('DELETE FROM key_stats WHERE id = ?');
  const stmtDeleteAffinityForKey = db.prepare('DELETE FROM resource_affinity WHERE key_id = ?');
  const stmtListPersistentKeys = db.prepare('SELECT id, value, weight, enabled FROM key_stats WHERE value IS NOT NULL ORDER BY id');
  const stmtGetKeyValue = db.prepare('SELECT value FROM key_stats WHERE id = ?');
  const stmtCountKeys = db.prepare('SELECT COUNT(*) AS count FROM key_stats');
  const stmtRecordAttempt = db.prepare(`
    UPDATE key_stats SET
      total_requests = total_requests + 1,
      success_count = success_count + @success,
      failure_count = failure_count + @failure,
      retry_count = retry_count + @retry,
      rate_limit_count = rate_limit_count + @rateLimit,
      timeout_count = timeout_count + @timeout,
      credits_exhausted_count = credits_exhausted_count + @creditsExhausted,
      last_status = @status,
      last_error = @lastError,
      last_latency_ms = @latencyMs,
      last_success_at = CASE WHEN @success = 1 THEN @now ELSE last_success_at END,
      last_failure_at = CASE WHEN @failure = 1 THEN @now ELSE last_failure_at END
    WHERE id = @keyId
  `);
  const stmtSetCooldown = db.prepare('UPDATE key_stats SET cooldown_until = ?, cooldown_reason = ? WHERE id = ?');
  const stmtSetEnabled = db.prepare('UPDATE key_stats SET enabled = ? WHERE id = ?');
  const stmtListKeyStats = db.prepare('SELECT * FROM key_stats ORDER BY id');
  const stmtSetAffinity = db.prepare(`
    INSERT INTO resource_affinity (resource_type, resource_id, key_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(resource_type, resource_id) DO UPDATE SET key_id = excluded.key_id, created_at = excluded.created_at
  `);
  const stmtGetAffinity = db.prepare('SELECT key_id AS keyId FROM resource_affinity WHERE resource_type = ? AND resource_id = ?');
  const stmtPruneAffinity = db.prepare('DELETE FROM resource_affinity WHERE created_at < ?');

  // Initialize keys: seed config keys into DB (DB is source of truth, never delete existing DB keys)
  for (const key of keys) {
    stmtUpsertKey.run({ id: key.id, enabled: key.enabled ? 1 : 0, weight: key.weight });
  }

  return {
    recordAttempt(record: AttemptRecord) {
      const now = Date.now();
      stmtRecordAttempt.run({
        keyId: record.keyId,
        success: record.success ? 1 : 0,
        failure: record.success ? 0 : 1,
        retry: record.retry ? 1 : 0,
        rateLimit: record.reason === 'rate_limit' ? 1 : 0,
        timeout: record.reason === 'timeout' ? 1 : 0,
        creditsExhausted: record.reason === 'credits_exhausted' ? 1 : 0,
        status: record.status,
        lastError: record.success ? null : record.reason,
        latencyMs: Math.round(record.latencyMs),
        now
      });
    },
    setCooldown(keyId, untilMs, reason) {
      stmtSetCooldown.run(untilMs, reason, keyId);
    },
    setEnabled(keyId, enabled) {
      stmtSetEnabled.run(enabled ? 1 : 0, keyId);
    },
    listKeyStats() {
      return stmtListKeyStats.all().map(keyStatsFromRow);
    },
    upsertKey(id, encryptedValue, weight, enabled) {
      stmtUpsertKeyWithValue.run({ id, enabled: enabled ? 1 : 0, weight, value: encryptedValue });
    },
    deleteKey(id) {
      db.transaction(() => {
        stmtDeleteAffinityForKey.run(id);
        stmtDeleteKey.run(id);
      })();
    },
    listPersistentKeys(): PersistentKey[] {
      return stmtListPersistentKeys.all().map((row: any) => ({
        id: row.id,
        value: row.value,
        weight: row.weight,
        enabled: bool(row.enabled)
      }));
    },
    getKeyValue(id) {
      const row = stmtGetKeyValue.get(id) as { value: string | null } | undefined;
      return row?.value ?? null;
    },
    keyCount() {
      const row = stmtCountKeys.get() as { count: number };
      return row.count;
    },
    setAffinity(type, id, keyId) {
      stmtSetAffinity.run(type, id, keyId, Date.now());
    },
    getAffinity(type, id) {
      const row = stmtGetAffinity.get(type, id) as { keyId: string } | undefined;
      return row?.keyId;
    },
    pruneAffinity(olderThanMs) {
      const info = stmtPruneAffinity.run(olderThanMs) as { changes: number };
      return info.changes;
    }
  };
}
