import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export function ensureParent(path: string): void {
  if (path === ':memory:') return;
  mkdirSync(dirname(path), { recursive: true });
}

export function openDatabase(path: string): Database.Database {
  ensureParent(path);
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  return db;
}

export function applySchema(db: Database.Database): void {
  db.exec(`
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
  `);

  // Safe migration: add credits_exhausted_count column if missing (existing databases)
  const columns = (db.prepare('PRAGMA table_info(key_stats)').all() as Array<{ name: string }>);
  if (!columns.some((col) => col.name === 'credits_exhausted_count')) {
    db.exec('ALTER TABLE key_stats ADD COLUMN credits_exhausted_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.some((col) => col.name === 'value')) {
    db.exec('ALTER TABLE key_stats ADD COLUMN value TEXT');
  }

  // Safe migration: add query column to request_logs if missing (existing databases)
  const logColumns = (db.prepare('PRAGMA table_info(request_logs)').all() as Array<{ name: string }>);
  if (!logColumns.some((col) => col.name === 'query')) {
    db.exec('ALTER TABLE request_logs ADD COLUMN query TEXT');
  }
}
