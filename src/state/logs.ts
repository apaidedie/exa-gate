import type Database from 'better-sqlite3';
import { percentile } from '../util/shared.js';
import {
  type KeyFailureSummary,
  type RequestLog,
  type RequestLogQuery,
  type RequestLogRecord,
  type RequestLogRetentionSummary,
  type RequestTrendBucket,
  type StateStore
} from './types.js';

export type LogsStore = Pick<
  StateStore,
  | 'recordRequestLog'
  | 'listRequestLogs'
  | 'getRequestTrace'
  | 'keyFailureSummary'
  | 'requestTrend'
  | 'requestLogRetentionSummary'
  | 'pruneRequestLogs'
>;

function normalizeLogQuery(query: number | RequestLogQuery | undefined): Required<RequestLogQuery> {
  if (typeof query === 'number' || query === undefined) {
    return { limit: query ?? 100, keyId: '', path: '', status: '', from: 0, to: 0, errorOnly: false };
  }
  return {
    limit: query.limit ?? 100,
    keyId: query.keyId ?? '',
    path: query.path ?? '',
    status: query.status ?? '',
    from: query.from ?? 0,
    to: query.to ?? 0,
    errorOnly: Boolean(query.errorOnly)
  };
}

function requestLogFromRow(row: any): RequestLog {
  return {
    requestId: row.request_id,
    tokenId: row.token_id,
    method: row.method,
    path: row.path,
    status: row.status,
    keyIds: JSON.parse(row.key_ids_json),
    attempts: row.attempts,
    latencyMs: row.latency_ms,
    errorCode: row.error_code,
    query: row.query ?? null,
    createdAt: row.created_at
  };
}

function reasonForFailure(log: RequestLog): string {
  if (log.errorCode) return log.errorCode;
  if (log.status === 429) return 'rate_limit';
  if (log.status >= 500) return 'upstream_error';
  if (log.status >= 400) return 'client_status';
  return 'unknown_error';
}

// Helper: build an exact JSON key match pattern to avoid substring false positives.
// key_ids_json stores arrays like ["exa_0001","exa_0002"], so we match on `"keyId"` with surrounding quotes.
function keyIdMatchPattern(keyId: string): string {
  return `%"${keyId.replace(/[\\"]/g, '\\$&')}"%`;
}

export function createLogsStore(db: Database.Database): LogsStore {
  const stmtInsertRequestLog = db.prepare(`
    INSERT INTO request_logs (request_id, token_id, method, path, status, key_ids_json, attempts, latency_ms, error_code, query, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stmtGetRequestTrace = db.prepare('SELECT * FROM request_logs WHERE request_id = ? ORDER BY id ASC LIMIT 100');
  const stmtRetentionSummary = db.prepare(`
    SELECT
      COUNT(*) AS total_logs,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS retained_logs,
      SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END) AS expired_logs,
      MIN(created_at) AS oldest_log_at,
      MAX(created_at) AS newest_log_at
    FROM request_logs
  `);
  const stmtPruneRequestLogs = db.prepare('DELETE FROM request_logs WHERE created_at < ?');

  return {
    recordRequestLog(record: RequestLogRecord) {
      stmtInsertRequestLog.run(
        record.requestId,
        record.tokenId,
        record.method,
        record.path,
        record.status,
        JSON.stringify(record.keyIds),
        record.attempts,
        Math.round(record.latencyMs),
        record.errorCode,
        record.query ?? null,
        Date.now()
      );
    },
    listRequestLogs(query) {
      const normalized = normalizeLogQuery(query);
      const clauses: string[] = [];
      const params: Array<string | number> = [];
      if (normalized.from > 0) {
        clauses.push('created_at >= ?');
        params.push(normalized.from);
      }
      if (normalized.to > 0) {
        clauses.push('created_at <= ?');
        params.push(normalized.to);
      }
      if (normalized.path) {
        clauses.push('path LIKE ?');
        params.push(`%${normalized.path}%`);
      }
      if (normalized.keyId) {
        clauses.push('key_ids_json LIKE ?');
        params.push(keyIdMatchPattern(normalized.keyId));
      }
      const status = String(normalized.status || '').trim().toLowerCase();
      if (status === 'success') clauses.push('status >= 200 AND status < 400 AND error_code IS NULL');
      if (status === 'error') clauses.push('(status >= 400 OR error_code IS NOT NULL)');
      if (/^[2-5]xx$/.test(status)) {
        const min = Number(status[0]) * 100;
        clauses.push('status >= ? AND status < ?');
        params.push(min, min + 100);
      }
      if (/^\d{3}$/.test(status)) {
        clauses.push('status = ?');
        params.push(Number(status));
      }
      if (normalized.errorOnly) clauses.push('(status >= 400 OR error_code IS NOT NULL)');
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = Math.max(1, Math.min(Number(normalized.limit) || 100, 5000));
      return db
        .prepare(`SELECT * FROM request_logs ${where} ORDER BY id DESC LIMIT ?`)
        .all(...params, limit)
        .map(requestLogFromRow);
    },
    getRequestTrace(requestId) {
      return stmtGetRequestTrace.all(String(requestId || '')).map(requestLogFromRow);
    },
    keyFailureSummary(keyId, limit = 20): KeyFailureSummary {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
      const samples = db
        .prepare(`
          SELECT * FROM request_logs
          WHERE key_ids_json LIKE ?
            AND (status >= 400 OR error_code IS NOT NULL)
          ORDER BY id DESC
          LIMIT ?
        `)
        .all(keyIdMatchPattern(String(keyId || '')), safeLimit)
        .map(requestLogFromRow);
      const reasons: Record<string, number> = {};
      for (const log of samples) {
        const reason = reasonForFailure(log);
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      const latest = samples[0];
      return {
        keyId,
        totalFailures: samples.length,
        reasons,
        lastFailureAt: latest?.createdAt ?? null,
        lastStatus: latest?.status ?? null,
        lastError: latest ? reasonForFailure(latest) : null,
        samples
      };
    },
    requestTrend(sinceMs, bucketMs): RequestTrendBucket[] {
      const safeBucket = Math.max(60000, Math.min(Math.round(bucketMs), 86400000));
      const now = Date.now();
      const start = Math.floor(Math.max(0, sinceMs) / safeBucket) * safeBucket;
      const bucketCount = Math.min(240, Math.max(1, Math.ceil((now - start) / safeBucket)));

      // Pre-initialize all expected buckets
      const buckets = new Map<number, RequestTrendBucket & { latencies: number[] }>();
      for (let index = 0; index < bucketCount; index += 1) {
        const bucketStart = start + index * safeBucket;
        buckets.set(bucketStart, { bucketStart, requests: 0, success: 0, failures: 0, rateLimits: 0, avgLatencyMs: 0, p95LatencyMs: 0, latencies: [] });
      }

      // Use SQLite GROUP BY for aggregate metrics (count, sum, avg).
      // Exclude pure auth probes (401/unauthorized with no key chain) so public scanners
      // do not paint the ops trend chart solid red or inflate window failure rates.
      const probeNoise = `(
        (error_code IN ('unauthorized', 'route_forbidden') OR status = 401)
        AND (key_ids_json IS NULL OR key_ids_json = '[]' OR key_ids_json = '')
      )`;
      const aggRows = db.prepare(`
        SELECT
          (created_at / ?) * ? AS bucket_start,
          SUM(CASE WHEN NOT ${probeNoise} THEN 1 ELSE 0 END) AS requests,
          SUM(CASE WHEN NOT ${probeNoise} AND status >= 200 AND status < 400 AND error_code IS NULL THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN NOT ${probeNoise} AND (status >= 400 OR error_code IS NOT NULL) THEN 1 ELSE 0 END) AS failures,
          SUM(CASE WHEN NOT ${probeNoise} AND (status = 429 OR error_code = 'rate_limit') THEN 1 ELSE 0 END) AS rate_limits,
          ROUND(AVG(CASE WHEN NOT ${probeNoise} THEN latency_ms END)) AS avg_latency_ms
        FROM request_logs
        WHERE created_at >= ?
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
      `).all(safeBucket, safeBucket, start) as Array<{ bucket_start: number; requests: number; success: number; failures: number; rate_limits: number; avg_latency_ms: number }>;

      for (const row of aggRows) {
        const bucketStart = Number(row.bucket_start);
        if (!buckets.has(bucketStart)) {
          buckets.set(bucketStart, { bucketStart, requests: 0, success: 0, failures: 0, rateLimits: 0, avgLatencyMs: 0, p95LatencyMs: 0, latencies: [] });
        }
        const bucket = buckets.get(bucketStart)!;
        bucket.requests = Number(row.requests);
        bucket.success = Number(row.success);
        bucket.failures = Number(row.failures);
        bucket.rateLimits = Number(row.rate_limits);
        bucket.avgLatencyMs = Math.round(Number(row.avg_latency_ms || 0));
      }

      // Fetch only latency values for P95 calculation (still needed in JS)
      const latencyRows = db.prepare('SELECT latency_ms, created_at FROM request_logs WHERE created_at >= ?').all(start) as Array<{ latency_ms: number; created_at: number }>;
      for (const row of latencyRows) {
        const bucketStart = Math.floor(row.created_at / safeBucket) * safeBucket;
        const bucket = buckets.get(bucketStart);
        if (bucket) bucket.latencies.push(row.latency_ms);
      }

      return [...buckets.values()]
        .sort((a, b) => a.bucketStart - b.bucketStart)
        .map((bucket) => {
          const p95LatencyMs = percentile(bucket.latencies, 0.95);
          const { latencies: _latencies, ...publicBucket } = bucket;
          return { ...publicBucket, p95LatencyMs };
        });
    },
    requestLogRetentionSummary(cutoffMs): RequestLogRetentionSummary {
      const row = stmtRetentionSummary.get(cutoffMs, cutoffMs) as any;
      return {
        totalLogs: Number(row.total_logs || 0),
        retainedLogs: Number(row.retained_logs || 0),
        expiredLogs: Number(row.expired_logs || 0),
        oldestLogAt: row.oldest_log_at ?? null,
        newestLogAt: row.newest_log_at ?? null
      };
    },
    pruneRequestLogs(olderThanMs) {
      const info = stmtPruneRequestLogs.run(olderThanMs) as { changes: number };
      return info.changes;
    }
  };
}
