import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('demo ui script', () => {
  it('exposes a reproducible Chinese admin UI demo entrypoint', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.['demo:ui']).toBe('tsx scripts/demo-ui-server.ts');
    expect(packageJson.scripts?.['capture:preview']).toBe('tsx scripts/capture-admin-preview.ts');
    expect(existsSync('scripts/demo-ui-server.ts')).toBe(true);
    expect(existsSync('scripts/capture-admin-preview.ts')).toBe(true);

    const script = readFileSync('scripts/demo-ui-server.ts', 'utf8');
    const captureScript = readFileSync('scripts/capture-admin-preview.ts', 'utf8');
    expect(script).toContain('admin_local_token');
    expect(script).toContain('client_local_token');
    expect(script).toContain('EXA_DEMO_PORT');
    expect(script).toContain('console.log(`地址: http://127.0.0.1:${config.port}`);');
    expect(script).not.toContain('http://127.0.0.1:8787/_proxy/ui');
    expect(script).toContain('触发一把搜索密钥限流');
    expect(script).toContain('冷却');
    expect(captureScript).toContain('docs/assets/admin-console.png');
    expect(captureScript).toContain('EXA_PREVIEW_PORT');
    expect(captureScript).toContain('EXA_DEMO_PORT');
    expect(captureScript).toContain("page.fill('#loginToken', 'admin_local_token')");
    expect(captureScript).toContain('key_01_search');
  });

  it('keeps the README admin console preview reproducible and non-empty', () => {
    const image = readFileSync('docs/assets/admin-console.png');
    const readme = readFileSync('README.md', 'utf8');
    const docsReadme = readFileSync('docs/README.md', 'utf8');
    const scriptsReadme = readFileSync('scripts/README.md', 'utf8');

    expect(readme).toContain('![Admin Console](docs/assets/admin-console.png)');
    expect(readme).toContain('npm run capture:preview');
    expect(docsReadme).toContain('npm run capture:preview');
    expect(scriptsReadme).toContain('capture-admin-preview.ts');
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(image.readUInt32BE(16)).toBe(1440);
    expect(image.readUInt32BE(20)).toBe(960);
    expect(image.length).toBeGreaterThan(120_000);
  });

  it('documents the local demo console flow in Chinese', () => {
    const readme = readFileSync('README.md', 'utf8');
    const checklist = readFileSync('docs/DEPLOYMENT_CHECKLIST.md', 'utf8');
    const vitestConfig = readFileSync('vitest.config.ts', 'utf8');

    expect(readme).toContain('一个可自托管的 Exa API 控制平面');
    expect(readme).toContain('项目给你的答案');
    expect(readme).toContain('Key 池健康、近期请求轨迹和下一步处理建议');
    expect(readme).toContain('纯静态 HTML/CSS/ES Modules');
    expect(readme).toContain('控制台预览');
    expect(readme).toContain('60 秒试用');
    expect(readme).toContain('npm run demo:ui');
    expect(readme).toContain('http://127.0.0.1:8787');
    expect(readme).toContain('admin_local_token');
    expect(readme).toContain('不会访问真实 Exa API');
    expect(readme).not.toContain('http://127.0.0.1:8787/_proxy/ui');
    expect(readme).toContain('管理员令牌');
    expect(readme).toContain('AES-256-GCM');
    expect(readme).toContain('npm run backup:docker');
    expect(readme).toContain('npm run restore:docker');
    expect(readme).toContain('POST /_proxy/keys');

    expect(checklist).toContain('EXA_KEYS_ENCRYPTION_SECRET');
    expect(checklist).not.toContain('http://127.0.0.1:8787/_proxy/ui');
    expect(checklist).toContain('EXA_PROXY_TOKENS');
    expect(checklist).toContain('/_proxy/keys');
    expect(checklist).toContain('管理员令牌');
    expect(vitestConfig).toContain("include: ['test/**/*.test.ts']");
  });
});
