import { describe, expect, it } from 'vitest';
import { isAllowedPath, isRetrySafe, parseResourceAffinity } from '../src/routes.js';

describe('routes', () => {
  it('matches exact and wildcard allowlist entries', () => {
    expect(isAllowedPath('/search', ['/search'])).toBe(true);
    expect(isAllowedPath('/v0/websets/abc', ['/v0/**'])).toBe(true);
    expect(isAllowedPath('/answer', ['/search'])).toBe(false);
  });

  it('allows safe retry methods and selected Exa read-style posts', () => {
    expect(isRetrySafe('GET', '/anything', {})).toBe(true);
    expect(isRetrySafe('POST', '/search', {})).toBe(true);
    expect(isRetrySafe('POST', '/monitors', {})).toBe(false);
    expect(isRetrySafe('POST', '/monitors', { 'idempotency-key': 'idem_1' })).toBe(true);
  });

  it('parses known resource affinity paths', () => {
    expect(parseResourceAffinity('/agent/runs/run_123')).toEqual({ type: 'agent_run', id: 'run_123' });
    expect(parseResourceAffinity('/v0/websets/ws_123/items')).toEqual({ type: 'webset', id: 'ws_123' });
    expect(parseResourceAffinity('/search')).toBeUndefined();
  });
});
