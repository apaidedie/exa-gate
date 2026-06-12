import { describe, expect, it } from 'vitest';
import { proxyError } from '../src/errors.js';

describe('proxyError', () => {
  it('returns stable JSON shape with request id', () => {
    expect(proxyError('no_healthy_keys', 'No healthy Exa API key is currently available.', 'req_123')).toEqual({
      error: {
        type: 'proxy_error',
        code: 'no_healthy_keys',
        message: 'No healthy Exa API key is currently available.',
        requestId: 'req_123'
      }
    });
  });
});
