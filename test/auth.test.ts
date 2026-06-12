import { describe, expect, it } from 'vitest';
import { isAuthorized, presentedTokenId, tokenId } from '../src/auth.js';
import { redactSecrets } from '../src/util/redact.js';

describe('auth', () => {
  it('accepts bearer and x-proxy-api-key tokens', () => {
    expect(isAuthorized({ authorization: 'Bearer client_token' }, ['client_token'])).toBe(true);
    expect(isAuthorized({ 'x-proxy-api-key': 'client_token' }, ['client_token'])).toBe(true);
  });

  it('rejects missing or incorrect tokens', () => {
    expect(isAuthorized({}, ['client_token'])).toBe(false);
    expect(isAuthorized({ authorization: 'Bearer wrong' }, ['client_token'])).toBe(false);
  });

  it('creates stable non-secret token ids', () => {
    expect(tokenId('client_token')).toMatch(/^tok_[a-f0-9]{12}$/);
    expect(tokenId('client_token')).toBe(tokenId('client_token'));
    expect(presentedTokenId({ authorization: 'Bearer client_token' }, ['client_token'])).toBe(tokenId('client_token'));
  });
});

describe('redactSecrets', () => {
  it('redacts configured secret strings', () => {
    expect(redactSecrets('key-a and client_token', ['key-a', 'client_token'])).toBe('[REDACTED] and [REDACTED]');
  });
});
