import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfigFromEnv } from '../src/config.js';

function parseDotEnv(body: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [name, ...rest] = line.split('=');
    env[name] = rest.join('=').trim();
  }
  return env;
}

describe('setup-env script', () => {
  it('generates a deployment env file with strong required secrets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exa-setup-env-'));
    const output = join(dir, '.env.generated');

    try {
      execFileSync(process.execPath, ['scripts/setup-env.mjs', '--output', output], { encoding: 'utf8' });
      const generated = readFileSync(output, 'utf8');
      const env = parseDotEnv(generated);

      expect(env.EXA_KEYS_ENCRYPTION_SECRET).toMatch(/^[a-f0-9]{64}$/);
      expect(env.EXA_PROXY_TOKENS).toMatch(/^proxy_[A-Za-z0-9_-]{32}$/);
      expect(env.EXA_ADMIN_TOKENS).toMatch(/^admin_[A-Za-z0-9_-]{32}$/);
      expect(generated).not.toContain('replace_with_a_strong_random_secret');
      expect(generated).not.toContain('replace_with_client_token');
      expect(generated).not.toContain('replace_with_admin_token');

      const config = loadConfigFromEnv(env);
      expect(config.proxyTokens).toEqual([env.EXA_PROXY_TOKENS]);
      expect(config.adminTokens).toEqual([env.EXA_ADMIN_TOKENS]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing env file unless forced', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exa-setup-env-existing-'));
    const output = join(dir, '.env.generated');

    try {
      execFileSync(process.execPath, ['scripts/setup-env.mjs', '--output', output], { encoding: 'utf8' });
      const refused = spawnSync(process.execPath, ['scripts/setup-env.mjs', '--output', output], { encoding: 'utf8' });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('already exists');
      execFileSync(process.execPath, ['scripts/setup-env.mjs', '--output', output, '--force'], { encoding: 'utf8' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
