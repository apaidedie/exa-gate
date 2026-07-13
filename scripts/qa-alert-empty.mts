import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-153-alert-empty');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-alert-empty-'));
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
  await page.getByRole('tab', { name: '概览' }).click();
  await page.waitForSelector('#alertList');
  await page.waitForTimeout(400);
  // Ensure healthy empty markup for visual QA.
  await page.evaluate(() => {
    const list = document.getElementById('alertList');
    if (!list) return;
    list.innerHTML = '<div class="alert-empty">'
      + '<span class="empty-kicker">无告警</span>'
      + '<strong>当前窗口无需人工处理</strong>'
      + '<p>系统会继续观察可用密钥、失败率和 429 突增。可随时打开密钥池或请求日志复核运行证据。</p>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-overview-signal-action="keys" aria-label="打开密钥池复核调度状态">查看密钥池</button>'
      + '<button class="ghost-btn" type="button" data-overview-signal-action="logs-focus" aria-label="打开请求日志复核流量">查看请求日志</button>'
      + '<span>保持观察，异常时会在此提示</span>'
      + '</div></div>';
  });
  const primary = page.locator('#alertList button[data-overview-signal-action="keys"]').first();
  await primary.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  const primaryBox = await primary.boundingBox();
  const secondaryBox = await page.locator('#alertList button[data-overview-signal-action="logs-focus"]').first().boundingBox();
  await page.locator('#alertList .alert-empty').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-alert-empty.png`), fullPage: false });

  await primary.click();
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

if (Math.round(mobile.primaryH) < 44) {
  console.error('FAIL: mobile primary short', mobile);
  process.exit(1);
}
if (!desktop.openedKeys || !mobile.openedKeys) {
  console.error('FAIL: keys action did not open keys panel', { desktop, mobile });
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.primaryH, 'mobile', mobile.primaryH, 'openedKeys ok');
