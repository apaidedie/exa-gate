type HeaderBag = Record<string, string | string[] | undefined>;

export type ResourceAffinity = { type: string; id: string };

function cleanPath(pathname: string): string {
  return pathname === '' ? '/' : pathname;
}

export function isAllowedPath(pathname: string, allowedPaths: string[]): boolean {
  const path = cleanPath(pathname);
  return allowedPaths.some((pattern) => {
    if (pattern === '/**') return true;
    if (pattern.endsWith('/**')) return path === pattern.slice(0, -3) || path.startsWith(pattern.slice(0, -2));
    return path === pattern;
  });
}

function hasIdempotencyKey(headers: HeaderBag): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === 'idempotency-key' && headers[name] !== undefined);
}

export function isRetrySafe(method: string, pathname: string, headers: HeaderBag): boolean {
  const normalized = method.toUpperCase();
  if (normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS') return true;
  if (normalized === 'POST' && ['/search', '/contents', '/answer'].includes(pathname)) return true;
  return hasIdempotencyKey(headers);
}

function segment(pathname: string, index: number): string | undefined {
  return pathname.split('/').filter(Boolean)[index];
}

export function parseResourceAffinity(pathname: string): ResourceAffinity | undefined {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'agent' && parts[1] === 'runs' && parts[2]) return { type: 'agent_run', id: parts[2] };
  if (parts[0] === 'research' && parts[1] === 'v1' && parts[2]) return { type: 'research', id: parts[2] };
  if (parts[0] === 'monitors' && parts[1]) return { type: 'monitor', id: parts[1] };
  if (parts[0] === 'v0' && parts[1] === 'websets' && parts[2]) return { type: 'webset', id: parts[2] };
  if (parts[0] === 'v0' && parts[1] === 'webhooks' && parts[2]) return { type: 'webhook', id: parts[2] };
  if (parts[0] === 'v0' && parts[1] === 'imports' && parts[2]) return { type: 'import', id: parts[2] };
  return undefined;
}

export function createdResourceFromResponse(method: string, pathname: string, body: unknown): ResourceAffinity | undefined {
  if (method.toUpperCase() !== 'POST' || !body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : undefined;
  const researchId = typeof record.researchId === 'string' ? record.researchId : undefined;

  if (pathname === '/agent/runs' && id) return { type: 'agent_run', id };
  if (pathname === '/research/v1' && (id || researchId)) return { type: 'research', id: id ?? researchId! };
  if (pathname === '/monitors' && id) return { type: 'monitor', id };
  if (pathname === '/v0/websets' && id) return { type: 'webset', id };
  if (pathname === '/v0/webhooks' && id) return { type: 'webhook', id };
  if (pathname === '/v0/imports' && id) return { type: 'import', id };
  return undefined;
}
