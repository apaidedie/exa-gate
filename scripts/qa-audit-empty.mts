import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-155-audit-empty');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-audit-empty-'));
const upstream = await createFakeExa(() => ({ status: 200, body: { results: [] } }));

const config: ProxyConfig = {
  host: '127.0.0.1',
  port: 0,
  upstreamUrl: upstream.url,
  keys: [{ id: 'key_01_search', value: 'fake_key_01', weight: 1, enabled: true }],
  encryptionSecret: 'test-encryption-secret-32ch',
  proxyTokens: ['client_local_token'],
  adminTokens: ['admin_local_token'],
  statePath: join(stateDir, 'state.sqlite'),
  selectionStrategy: 'adaptive_weighted',
  maxAttempts: 2,
  attemptTimeoutMs: 1000,
  retryBackoffMs: [1],
  failureThreshold: 10,
  failureWindowSeconds: 60,
  cooldownSeconds: 60,
  rateLimitCooldownSeconds: 60,
  creditsExhaustedCooldownSeconds: 600,
  maxBodyBytes: 20971520,
  allowedPaths: ['/**'],
  resourceAffinity: true,
  logLevel: 'silent',
  adminSessionTtlSeconds: 604800,
  adminLockoutMaxFailures: 5,
  adminLockoutWindowSeconds: 300,
  adminLockoutSeconds: 900,
  adminRequireHttps: false,
  allowRawKeyDisplay: false,
  logRetentionDays: 14,
  alertAvailableKeyMin: 1,
  alertFailureRatePercent: 10,
  alertRateLimitRatePercent: 20,
  alertWebhookUrl: null,
  alertWebhookBearerToken: null,
  alertWebhookCooldownSeconds: 300,
  alertWebhookHmacSecret: null,
  alertWebhookMaxAttempts: 1,
  alertWebhookRetryBackoffMs: 1,
  trendWindowHours: 24,
  trustProxy: false,
  upstreamPoolConnections: 32,
  affinityRetentionDays: 7,
  proxyRateLimitPerMinute: 0
};

const app = await buildApp({ config });
const baseUrl = await listenUrl(app);
const browser = await chromium.launch();

async function capture(name: string, width: number, height = 844) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width <= 430
  });
  await page.goto(baseUrl);
  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await page.waitForSelector('[data-console-shell]');
  await page.getByRole('tab', { name: '审计' }).click().catch(async () => {
    await page.getByRole('tab', { name: /审计/ }).click();
  });
  await page.waitForSelector('#auditList');
  await page.waitForTimeout(400);
  // Force true-empty markup for visual QA (login may have created audit rows).
  await page.evaluate(() => {
    const list = document.getElementById('auditList');
    if (!list) return;
    list.innerHTML = '<div class="audit-empty-state empty">'
      + '<div class="empty-kicker">管理员审计</div>'
      + '<h3>暂无审计记录</h3>'
      + '<p>管理员登录、导出、密钥操作和日志治理动作会在这里形成可导出的证据链。可先刷新窗口，或到密钥池完成一次导入/测试后回来查看。</p>'
      + '<div class="trace-empty-steps"><span>刷新审计</span><span>密钥动作</span><span>导出证据</span></div>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="refresh-audit">刷新列表</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="open-keys">打开密钥池</button>'
      + '<span>重新载入或生成新的管理证据</span>'
      + '</div></div>';
  });
  const secondary = page.locator('#auditList button[data-empty-action="open-keys"]').first();
  await secondary.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  const primaryBox = await page.locator('#auditList button[data-empty-action="refresh-audit"]').first().boundingBox();
  const secondaryBox = await secondary.boundingBox();
  await page.locator('#auditList .audit-empty-state').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-audit-empty.png`), fullPage: false });

  await secondary.click();
  await page.waitForTimeout(300);
  const onKeys = await page.locator('[data-tab-panel="keys"]').isVisible();
  const metrics = {
    primaryH: primaryBox?.height || 0,
    secondaryH: secondaryBox?.height || 0,
    openedKeys: onKeys
  };
  console.log(name, JSON.stringify(metrics));
  await page.close();
  return metrics;
}

const desktop = await capture('desktop-1440', 1440, 960);
const mobile = await capture('mobile-390', 390, 844);

await browser.close();
await new Promise<void>((resolve, reject) => {
  app.close((err?: Error) => (err ? reject(err) : resolve()));
});
try { upstream.close(); } catch {}
rmSync(stateDir, { recursive: true, force: true });

if (Math.round(mobile.primaryH) < 44 || Math.round(mobile.secondaryH) < 44) {
  console.error('FAIL: mobile CTAs short', mobile);
  process.exit(1);
}
if (!desktop.openedKeys || !mobile.openedKeys) {
  console.error('FAIL: open-keys did not open keys panel', { desktop, mobile });
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.primaryH, desktop.secondaryH, 'mobile', mobile.primaryH, 'openedKeys ok');
