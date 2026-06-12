export type RetryReason = 'ok' | 'rate_limit' | 'transient_status' | 'client_status' | 'timeout' | 'connection_error' | 'unknown_error';
export type RetryDecision = { retryable: boolean; reason: RetryReason };

const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function classifyStatus(status: number): RetryDecision {
  if (status === 429) return { retryable: true, reason: 'rate_limit' };
  if (retryableStatuses.has(status)) return { retryable: true, reason: 'transient_status' };
  if (status >= 400 && status < 500) return { retryable: false, reason: 'client_status' };
  return { retryable: false, reason: 'ok' };
}

export function classifyError(error: unknown): RetryDecision {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (code.includes('TIMEOUT') || name === 'TimeoutError' || name === 'AbortError' || message.includes('timeout')) {
    return { retryable: true, reason: 'timeout' };
  }
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(code)) {
    return { retryable: true, reason: 'connection_error' };
  }
  return { retryable: false, reason: 'unknown_error' };
}

export function parseRetryAfterMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export function retryBackoffMs(backoffs: number[], attemptIndex: number): number {
  if (backoffs.length === 0) return 0;
  return backoffs[Math.min(attemptIndex, backoffs.length - 1)];
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
