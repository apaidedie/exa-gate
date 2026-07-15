import type { KeyConfig } from './app.js';
import { createAuditStore } from './state/audit.js';
import { createKeysStore } from './state/keys.js';
import { createLogsStore } from './state/logs.js';
import { applySchema, openDatabase } from './state/migrations.js';
import { createSessionsStore } from './state/sessions.js';
import type { StateStore } from './state/types.js';

export type {
  AttemptRecord,
  RequestLogRecord,
  RequestLogQuery,
  AdminAuditQuery,
  KeyStats,
  PersistentKey,
  RequestLog,
  KeyFailureSummary,
  RequestTrendBucket,
  RequestLogRetentionSummary,
  AdminAuditRecord,
  AdminSessionRecord,
  AdminAuditLog,
  StateStore
} from './state/types.js';

export function createStateStore(path: string, keys: KeyConfig[]): StateStore {
  const db = openDatabase(path);
  applySchema(db);

  const keysStore = createKeysStore(db, keys);
  const logsStore = createLogsStore(db);
  const auditStore = createAuditStore(db);
  const sessionsStore = createSessionsStore(db);

  return {
    ...keysStore,
    ...logsStore,
    ...auditStore,
    ...sessionsStore,
    runTransaction(fn: () => void): void {
      db.transaction(fn)();
    },
    close() {
      db.close();
    }
  };
}
