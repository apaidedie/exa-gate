import { describe, expect, it } from 'vitest';
import { loadConfigFromEnv } from '../src/config.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfigFromEnv', () => {
  it('parses keys, weights, tokens, paths, and defaults', () => {
    const config = loadConfigFromEnv({
      EXA_KEYS: 'exa_a:key-a:1,exa_b:key-b:2',
      EXA_PROXY_TOKENS: 'client-a,client-b',
      EXA_ADMIN_TOKENS: 'admin-a',
      EXA_RETRY_BACKOFF_MS: '100,250',
      EXA_ALLOWED_PATHS: '/search,/contents,/v0/**',
      EXA_ALERT_WEBHOOK_URL: 'https://ops.example.test/exa-alerts',
      EXA_ALERT_WEBHOOK_BEARER_TOKEN: 'ops-secret',
      EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS: '45',
      EXA_ALERT_WEBHOOK_HMAC_SECRET: 'signing-secret',
      EXA_ALERT_WEBHOOK_MAX_ATTEMPTS: '2',
      EXA_ALERT_WEBHOOK_RETRY_BACKOFF_MS: '25'
    });

    expect(config.keys).toEqual([
      { id: 'exa_a', value: 'key-a', weight: 1, enabled: true },
      { id: 'exa_b', value: 'key-b', weight: 2, enabled: true }
    ]);
    expect(config.proxyTokens).toEqual(['client-a', 'client-b']);
    expect(config.adminTokens).toEqual(['admin-a']);
    expect(config.retryBackoffMs).toEqual([100, 250]);
    expect(config.allowedPaths).toEqual(['/search', '/contents', '/v0/**']);
    expect(config.port).toBe(8787);
    expect(config.selectionStrategy).toBe('weighted_round_robin');
    expect((config as any).alertWebhookUrl).toBe('https://ops.example.test/exa-alerts');
    expect((config as any).alertWebhookBearerToken).toBe('ops-secret');
    expect((config as any).alertWebhookCooldownSeconds).toBe(45);
    expect((config as any).alertWebhookHmacSecret).toBe('signing-secret');
    expect((config as any).alertWebhookMaxAttempts).toBe(2);
    expect((config as any).alertWebhookRetryBackoffMs).toBe(25);
  });

  it('resolves ${NAME} key placeholders from the environment object', () => {
    const config = loadConfigFromEnv({
      EXA_KEY_A: 'resolved-key-a',
      EXA_KEYS: 'exa_a:${EXA_KEY_A}:3',
      EXA_PROXY_TOKENS: 'client'
    });

    expect(config.keys).toEqual([{ id: 'exa_a', value: 'resolved-key-a', weight: 3, enabled: true }]);
  });

  it('loads one-key-per-line key files without requiring a huge EXA_KEYS value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exa-key-file-'));
    const file = join(dir, 'exa_api_key.txt');
    writeFileSync(file, ['first-real-key', 'EXA_API_KEY=second-real-key', 'first-real-key', '# ignored'].join('\n'));

    try {
      const config = loadConfigFromEnv({
        EXA_KEYS_FILE: file,
        EXA_PROXY_TOKENS: 'client'
      });

      expect(config.keys).toEqual([
        { id: 'exa_0001', value: 'first-real-key', weight: 1, enabled: true },
        { id: 'exa_0002', value: 'second-real-key', weight: 1, enabled: true }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts adaptive weighted selection strategy', () => {
    const config = loadConfigFromEnv({
      EXA_KEYS: 'exa_a:key-a:1,exa_b:key-b:1',
      EXA_PROXY_TOKENS: 'client',
      EXA_SELECTION_STRATEGY: 'adaptive_weighted'
    });

    expect(config.selectionStrategy).toBe('adaptive_weighted');
  });

  it('rejects missing proxy tokens and invalid key entries', () => {
    expect(() => loadConfigFromEnv({ EXA_KEYS: 'exa_a:key-a:1' })).toThrow('EXA_PROXY_TOKENS is required');
    expect(() => loadConfigFromEnv({ EXA_KEYS: 'broken', EXA_PROXY_TOKENS: 'client' })).toThrow(
      'Invalid EXA_KEYS entry'
    );
  });
});
