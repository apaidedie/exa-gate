import { describe, expect, it } from 'vitest';
import { buildUpstreamHeaders, sanitizeResponseHeaders } from '../src/headers.js';

describe('headers', () => {
  it('strips client secrets and hop-by-hop headers while injecting upstream key', () => {
    const headers = buildUpstreamHeaders(
      {
        authorization: 'Bearer client_token',
        'x-api-key': 'downstream-secret',
        connection: 'close',
        'content-type': 'application/json',
        accept: 'application/json'
      },
      { upstreamKey: 'exa-secret', requestId: 'req_1' }
    );

    expect(headers.authorization).toBeUndefined();
    expect(headers.connection).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-api-key']).toBe('exa-secret');
    expect(headers['x-request-id']).toBe('req_1');
  });

  it('sanitizes response hop-by-hop headers', () => {
    expect(sanitizeResponseHeaders({ connection: 'close', 'content-type': 'application/json' })).toEqual({
      'content-type': 'application/json'
    });
  });
});
