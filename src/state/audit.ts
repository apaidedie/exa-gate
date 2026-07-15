import type Database from 'better-sqlite3';
import { bool, type AdminAuditLog, type AdminAuditQuery, type AdminAuditRecord, type StateStore } from './types.js';

export type AuditStore = Pick<StateStore, 'recordAdminAudit' | 'listAdminAuditLogs'>;

function normalizeAuditQuery(query: number | AdminAuditQuery): Required<AdminAuditQuery> {
  if (typeof query === 'number') {
    return { limit: query, action: '', success: undefined as unknown as boolean, from: 0, to: 0 };
  }
  return {
    limit: query.limit ?? 50,
    action: query.action ?? '',
    success: query.success as boolean,
    from: query.from ?? 0,
    to: query.to ?? 0
  };
}

function auditLogFromRow(row: any): AdminAuditLog {
  return {
    actorTokenId: row.actor_token_id,
    action: row.action,
    targetId: row.target_id,
    success: bool(row.success),
    detail: row.detail,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
}

export function createAuditStore(db: Database.Database): AuditStore {
  const stmtInsertAudit = db.prepare(`
    INSERT INTO admin_audit_logs (actor_token_id, action, target_id, success, detail, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    recordAdminAudit(record: AdminAuditRecord) {
      stmtInsertAudit.run(
        record.actorTokenId,
        record.action,
        record.targetId ?? null,
        record.success ? 1 : 0,
        record.detail ?? null,
        record.ip ?? null,
        record.userAgent ?? null,
        Date.now()
      );
    },
    listAdminAuditLogs(query) {
      const normalized = normalizeAuditQuery(query);
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
      if (normalized.action) {
        clauses.push('action LIKE ?');
        params.push(`%${normalized.action}%`);
      }
      if (typeof normalized.success === 'boolean') {
        clauses.push('success = ?');
        params.push(normalized.success ? 1 : 0);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = Math.max(1, Math.min(Number(normalized.limit) || 50, 5000));
      return db
        .prepare(`SELECT * FROM admin_audit_logs ${where} ORDER BY id DESC LIMIT ?`)
        .all(...params, limit)
        .map(auditLogFromRow);
    }
  };
}
