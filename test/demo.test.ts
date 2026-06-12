import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('demo ui script', () => {
  it('exposes a reproducible Chinese admin UI demo entrypoint', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['demo:ui']).toBe('tsx scripts/demo-ui-server.ts');
    expect(existsSync('scripts/demo-ui-server.ts')).toBe(true);

    const script = readFileSync('scripts/demo-ui-server.ts', 'utf8');
    expect(script).toContain('admin_local_token');
    expect(script).toContain('client_local_token');
    expect(script).toContain("console.log('地址: http://127.0.0.1:8787');");
    expect(script).not.toContain('http://127.0.0.1:8787/_proxy/ui');
    expect(script).toContain('触发一把搜索密钥限流');
    expect(script).toContain('冷却');
  });

  it('documents the local demo console flow in Chinese', () => {
    const readme = readFileSync('README.md', 'utf8');
    const checklist = readFileSync('docs/deployment-checklist.md', 'utf8');
    const vitestConfig = readFileSync('vitest.config.ts', 'utf8');

    expect(readme).toContain('本地控制台演示');
    expect(readme).toContain('npm run demo:ui');
    expect(readme).toContain('http://127.0.0.1:8787`');
    expect(readme).not.toContain('http://127.0.0.1:8787/_proxy/ui');
    expect(readme).toContain('管理员令牌');
    expect(readme).toContain('EXA_KEYS_FILE');
    expect(readme).toContain('exa_api_key.txt');
    expect(readme).toContain('`GET /`');
    expect(readme).toContain('兼容入口');

    expect(checklist).toContain('本地演示服务：`http://127.0.0.1:8787`');
    expect(checklist).not.toContain('http://127.0.0.1:8787/_proxy/ui');
    expect(checklist).toContain('58 个用例');
    expect(checklist).toContain('EXA_KEYS_FILE=/run/secrets/exa_api_key.txt');
    expect(checklist).toContain('EXA_ALERT_WEBHOOK_COOLDOWN_SECONDS=300');
    expect(checklist).toContain('不是 Exa API Key');
    expect(vitestConfig).toContain("include: ['test/**/*.test.ts']");
  });
});
