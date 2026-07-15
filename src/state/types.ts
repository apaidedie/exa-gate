export type AttemptRecord = {
  keyId: string;
  status: number | null;
  success: boolean;
  latencyMs: number;
  retry: boolean;
  reason: string;
};

export type RequestLogRecord = {
  requestId: string;
  tokenId: string | null;
  method: string;
  path: string;
  status: number;
  keyIds: string[];
  attempts: number;
  latencyMs: number;
  errorCode: string | null;
  query?: string | null;
};

export type RequestLogQuery = {
  limit?: number;
  keyId?: string;
  path?: string;
  status?: string | number;
  from?: number;
  to?: number;
  errorOnly?: boolean;
};

export type AdminAuditQuery = {
  limit?: number;
  action?: string;
  success?: boolean;
  from?: number;
  to?: number;
};

export type KeyStats = {
  id: string;
  enabled: boolean;
  weight: number;
  value: string | null;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  retryCount: number;
  rateLimitCount: number;
  timeoutCount: number;
  creditsExhaustedCount: number;
  cooldownUntil: number;
  cooldownReason: string | null;
  lastStatus: number | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
};

export type PersistentKey = {
  id: string;
  value: string;
  weight: number;
  enabled: boolean;
};

export type RequestLog = Omit<RequestLogRecord, 'keyIds' | 'query'> & { createdAt: number; keyIds: string[]; query: string | null };

export type KeyFailureSummary = {
  keyId: string;
  totalFailures: number;
  reasons: Record<string, number>;
  lastFailureAt: number | null;
  lastStatus: number | null;
  lastError: string | null;
  samples: RequestLog[];
};

export type RequestTrendBucket = {
  bucketStart: number;
  requests: number;
  success: number;
  failures: number;
  rateLimits: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
};

export type RequestLogRetentionSummary = {
  totalLogs: number;
  retainedLogs: number;
  expiredLogs: number;
  oldestLogAt: number | null;
  newestLogAt: number | null;
};

export type AdminAuditRecord = {
  actorTokenId: string | null;
  action: string;
  targetId?: string | null;
  success: boolean;
  detail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export type AdminSessionRecord = {
  id: string;
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
};

export type AdminAuditLog = Required<Omit<AdminAuditRecord, 'targetId' | 'detail' | 'ip' | 'userAgent'>> & {
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
};

export type StateStore = {
  recordAttempt(record: AttemptRecord): void;
  setCooldown(keyId: string, untilMs: number, reason: string | null): void;
  setEnabled(keyId: string, enabled: boolean): void;
  listKeyStats(): KeyStats[];
  upsertKey(id: string, encryptedValue: string, weight: number, enabled: boolean): void;
  deleteKey(id: string): void;
  listPersistentKeys(): PersistentKey[];
  getKeyValue(id: string): string | null;
  keyCount(): number;
  setAffinity(type: string, id: string, keyId: string): void;
  getAffinity(type: string, id: string): string | undefined;
  pruneAffinity(olderThanMs: number): number;
  recordRequestLog(record: RequestLogRecord): void;
  listRequestLogs(query?: number | RequestLogQuery): RequestLog[];
  getRequestTrace(requestId: string): RequestLog[];
  keyFailureSummary(keyId: string, limit?: number): KeyFailureSummary;
  requestTrend(sinceMs: number, bucketMs: number): RequestTrendBucket[];
  requestLogRetentionSummary(cutoffMs: number): RequestLogRetentionSummary;
  pruneRequestLogs(olderThanMs: number): number;
  recordAdminAudit(record: AdminAuditRecord): void;
  listAdminAuditLogs(query: number | AdminAuditQuery): AdminAuditLog[];
  createAdminSession(record: AdminSessionRecord): void;
  getAdminSession(sessionId: string): AdminSessionRecord | undefined;
  touchAdminSession(sessionId: string, lastSeenAt: number): void;
  deleteAdminSession(sessionId: string): void;
  pruneAdminSessions(nowMs: number): number;
  runTransaction(fn: () => void): void;
  close(): void;
};

export function bool(value: unknown): boolean {
  return value === 1 || value === true;
}
