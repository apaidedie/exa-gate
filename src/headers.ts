type HeaderBag = Record<string, string | string[] | number | undefined>;

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const requestSecretHeaders = new Set(['authorization', 'x-api-key', 'x-proxy-api-key', 'host', 'content-length']);
const responseSecretHeaders = new Set(['authorization', 'x-api-key', 'x-proxy-api-key']);

function firstHeader(value: string | string[] | number | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'number') return String(value);
  return value;
}

export function buildUpstreamHeaders(
  downstreamHeaders: HeaderBag,
  options: { upstreamKey: string; requestId: string }
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(downstreamHeaders)) {
    const name = rawName.toLowerCase();
    if (hopByHopHeaders.has(name) || requestSecretHeaders.has(name)) continue;
    const value = firstHeader(rawValue);
    if (value !== undefined) headers[name] = value;
  }
  headers['x-api-key'] = options.upstreamKey;
  headers['x-request-id'] = options.requestId;
  return headers;
}

export function sanitizeResponseHeaders(upstreamHeaders: HeaderBag): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(upstreamHeaders)) {
    const name = rawName.toLowerCase();
    if (hopByHopHeaders.has(name) || responseSecretHeaders.has(name)) continue;
    const value = firstHeader(rawValue);
    if (value !== undefined) headers[name] = value;
  }
  return headers;
}
