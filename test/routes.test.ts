import { describe, expect, it } from 'vitest';
import { createdResourceFromResponse, isAllowedPath, isResourceCreatingPath, isRetrySafe, parseResourceAffinity } from '../src/routes.js';

describe('routes', () => {
  it('matches exact and wildcard allowlist entries', () => {
    expect(isAllowedPath('/search', ['/search'])).toBe(true);
    expect(isAllowedPath('/v0/websets/abc', ['/v0/**'])).toBe(true);
    expect(isAllowedPath('/answer', ['/search'])).toBe(false);
  });

  it('allows safe retry methods and selected Exa read-style posts', () => {
    expect(isRetrySafe('GET', '/anything', {})).toBe(true);
    expect(isRetrySafe('POST', '/search', {})).toBe(true);
    expect(isRetrySafe('POST', '/contents', {})).toBe(true);
    expect(isRetrySafe('POST', '/answer', {})).toBe(true);
    expect(isRetrySafe('POST', '/monitors', {})).toBe(true);
    expect(isRetrySafe('POST', '/monitors/mon_abc/trigger', {})).toBe(true);
    expect(isRetrySafe('POST', '/agent/runs/run_123/cancel', {})).toBe(true);
    expect(isRetrySafe('POST', '/monitors/batch', {})).toBe(true);
    expect(isRetrySafe('POST', '/v0/websets', {})).toBe(false);
    expect(isRetrySafe('POST', '/v0/websets', { 'idempotency-key': 'idem_1' })).toBe(true);
    // Official idempotent POSTs may fail over like reads.
    expect(isRetrySafe('POST', '/findSimilar', {})).toBe(true);
    expect(isRetrySafe('POST', '/v0/websets/preview', {})).toBe(true);
    expect(isRetrySafe('POST', '/batches/bat_1/cancel', {})).toBe(true);
    expect(isRetrySafe('POST', '/v0/websets/ws_1/cancel', {})).toBe(true);
    expect(isRetrySafe('POST', '/v0/websets/ws_1/searches/s_1/cancel', {})).toBe(true);
    // Creating resources stays single-key unless the client opts in.
    expect(isRetrySafe('POST', '/batches', {})).toBe(false);
    expect(isRetrySafe('POST', '/v0/websets/ws_1/enrichments', {})).toBe(false);
  });

  it('identifies resource-creating POST paths for JSON buffering optimization', () => {
    expect(isResourceCreatingPath('/agent/runs')).toBe(true);
    expect(isResourceCreatingPath('/research/v1')).toBe(true);
    expect(isResourceCreatingPath('/monitors')).toBe(true);
    expect(isResourceCreatingPath('/v0/websets')).toBe(true);
    expect(isResourceCreatingPath('/v0/webhooks')).toBe(true);
    expect(isResourceCreatingPath('/v0/imports')).toBe(true);
    expect(isResourceCreatingPath('/search')).toBe(false);
    expect(isResourceCreatingPath('/contents')).toBe(false);
    expect(isResourceCreatingPath('/answer')).toBe(false);
    expect(isResourceCreatingPath('/batches')).toBe(true);
    expect(isResourceCreatingPath('/v0/websets/ws_1/enrichments')).toBe(true);
    expect(isResourceCreatingPath('/v0/websets/ws_1/items')).toBe(true);
    expect(isResourceCreatingPath('/v0/websets/ws_1/searches')).toBe(true);
    expect(isResourceCreatingPath('/v0/websets/ws_1/cancel')).toBe(false);
    expect(isResourceCreatingPath('/v0/websets/ws_1/items/it_1')).toBe(false);
  });

  it('parses known resource affinity paths', () => {
    expect(parseResourceAffinity('/agent/runs/run_123')).toEqual({ type: 'agent_run', id: 'run_123' });
    expect(parseResourceAffinity('/v0/websets/ws_123/items')).toEqual({ type: 'webset', id: 'ws_123' });
    expect(parseResourceAffinity('/search')).toBeUndefined();
  });

  it('parses batch affinity paths', () => {
    expect(parseResourceAffinity('/batches/bat_1')).toEqual({ type: 'batch', id: 'bat_1' });
    expect(parseResourceAffinity('/batches/bat_1/cancel')).toEqual({ type: 'batch', id: 'bat_1' });
    expect(parseResourceAffinity('/batches')).toBeUndefined();
  });

  it('routes webset sub-resource paths to parent webset affinity', () => {
    expect(parseResourceAffinity('/v0/websets/ws_123/enrichments/enr_456')).toEqual({ type: 'webset', id: 'ws_123' });
    expect(parseResourceAffinity('/v0/websets/ws_123/enrichments')).toEqual({ type: 'webset', id: 'ws_123' });
    expect(parseResourceAffinity('/v0/websets/ws_123/searches')).toEqual({ type: 'webset', id: 'ws_123' });
  });

  it('extracts resource IDs from response bodies with variant field names', () => {
    expect(createdResourceFromResponse('POST', '/agent/runs', { runId: 'r1' })).toEqual({ type: 'agent_run', id: 'r1' });
    expect(createdResourceFromResponse('POST', '/agent/runs', { id: 'r2' })).toEqual({ type: 'agent_run', id: 'r2' });
    expect(createdResourceFromResponse('POST', '/research/v1', { researchId: 'rs1' })).toEqual({ type: 'research', id: 'rs1' });
    expect(createdResourceFromResponse('POST', '/monitors', { monitorId: 'm1' })).toEqual({ type: 'monitor', id: 'm1' });
    expect(createdResourceFromResponse('POST', '/v0/websets', { websetId: 'ws1' })).toEqual({ type: 'webset', id: 'ws1' });
    expect(createdResourceFromResponse('POST', '/v0/webhooks', { webhookId: 'wh1' })).toEqual({ type: 'webhook', id: 'wh1' });
    expect(createdResourceFromResponse('POST', '/v0/imports', { importId: 'imp1' })).toEqual({ type: 'import', id: 'imp1' });
    expect(createdResourceFromResponse('POST', '/search', { id: 'x' })).toBeUndefined();
    expect(createdResourceFromResponse('GET', '/monitors', { monitorId: 'm1' })).toBeUndefined();
    // Webset child creations pin the PARENT webset (children live on the webset's key).
    expect(createdResourceFromResponse('POST', '/v0/websets/ws_1/enrichments', { id: 'enr_1' })).toEqual({ type: 'webset', id: 'ws_1' });
    expect(createdResourceFromResponse('POST', '/v0/websets/ws_1/items', { items: [{ id: 'i1' }] })).toEqual({ type: 'webset', id: 'ws_1' });
    expect(createdResourceFromResponse('POST', '/v0/websets/ws_1/searches', { id: 's_1' })).toEqual({ type: 'webset', id: 'ws_1' });
    expect(createdResourceFromResponse('POST', '/batches', { id: 'bat_1' })).toEqual({ type: 'batch', id: 'bat_1' });
    expect(createdResourceFromResponse('POST', '/v0/websets/preview', { id: 'x' })).toBeUndefined();
  });
});
