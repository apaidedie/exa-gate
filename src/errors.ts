import { randomUUID } from 'node:crypto';

export function proxyError(
  code: string,
  message: string,
  requestId: string
): { error: { type: 'proxy_error'; code: string; message: string; requestId: string } } {
  return { error: { type: 'proxy_error', code, message, requestId } };
}

export function requestIdFrom(headers: Record<string, string | string[] | undefined>): string {
  const existing = headers['x-request-id'];
  if (typeof existing === 'string' && existing.length > 0) return existing;
  return `req_${randomUUID()}`;
}
