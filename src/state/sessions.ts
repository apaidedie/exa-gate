import type Database from 'better-sqlite3';
import { type AdminSessionRecord, type StateStore } from './types.js';

export type SessionsStore = Pick<
  StateStore,
  'createAdminSession' | 'getAdminSession' | 'touchAdminSession' | 'deleteAdminSession' | 'pruneAdminSessions'
>;

function adminSessionFromRow(row: any): AdminSessionRecord {
  return {
    id: row.id,
    tokenId: row.token_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at
  };
}

export function createSessionsStore(db: Database.Database): SessionsStore {
  const stmtUpsertSession = db.prepare(`
    INSERT INTO admin_sessions (id, token_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      token_id = excluded.token_id,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at,
      last_seen_at = excluded.last_seen_at
  `);
  const stmtGetSession = db.prepare('SELECT * FROM admin_sessions WHERE id = ?');
  const stmtTouchSession = db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?');
  const stmtDeleteSession = db.prepare('DELETE FROM admin_sessions WHERE id = ?');
  const stmtPruneSessions = db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?');

  return {
    createAdminSession(record) {
      stmtUpsertSession.run(record.id, record.tokenId, record.createdAt, record.expiresAt, record.lastSeenAt);
    },
    getAdminSession(sessionId) {
      const row = stmtGetSession.get(String(sessionId || '')) as any;
      return row ? adminSessionFromRow(row) : undefined;
    },
    touchAdminSession(sessionId, lastSeenAt) {
      stmtTouchSession.run(lastSeenAt, String(sessionId || ''));
    },
    deleteAdminSession(sessionId) {
      stmtDeleteSession.run(String(sessionId || ''));
    },
    pruneAdminSessions(nowMs) {
      const info = stmtPruneSessions.run(nowMs) as { changes: number };
      return info.changes;
    }
  };
}
