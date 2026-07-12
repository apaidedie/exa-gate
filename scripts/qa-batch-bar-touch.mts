import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-129-batch-bar');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-batch-bar-'));
const upstream = await createFakeExa(() => ({ status: 200, body: { results: [] } }));

const config: ProxyConfig = {
  host: '127.0.0.1',
  port: 0,
  upstreamUrl: upstream.url,
  keys: [
    { id: 'key_01_search', value: 'fake_key_01', weight: 1, enabled: true },
    { id: 'key_02_contents', value: 'fake_key_02', weight: 1, enabled: true }
  ],
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
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.locator('#keysBody tr[data-key-id="key_01_search"] input.key-checkbox').check();
  await page.waitForSelector('#batchBar', { state: 'visible', timeout: 8000 });

  const metrics = await page.evaluate(() => {
    const ids = ['batchClearSelection', 'batchEnableSelected', 'batchDisableSelected', 'batchResetSelected', 'batchTestSelected'];
    const buttons = ids.map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect();
      return { id, height: rect?.height || 0, width: rect?.width || 0 };
    });
    const bar = document.getElementById('batchBar')?.getBoundingClientRect();
    const mainPad = Number.parseFloat(getComputedStyle(document.querySelector('.main') as Element).paddingBottom);
    return {
      buttons,
      barHeight: bar?.height || 0,
      mainPad,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  await page.screenshot({ path: join(outDir, `${name}-batch-open.png`), fullPage: false });
  console.log(name, JSON.stringify(metrics, null, 2));
  await page.close();
  return metrics;
}

const desktop = await capture('desktop-1440', 1440, 960);
const mobile = await capture('mobile-390', 390, 844);
const tablet = await capture('tablet-760', 760, 844);

await browser.close();
await new Promise<void>((resolve, reject) => {
  app.close((err?: Error) => (err ? reject(err) : resolve()));
});
try { upstream.close(); } catch {}
rmSync(stateDir, { recursive: true, force: true });

const mobileMin = Math.min(...mobile.buttons.map((b) => b.height));
if (mobileMin < 44) {
  console.error('FAIL: mobile batch buttons below 44px', mobileMin);
  process.exit(1);
}
if (mobile.mainPad < 200) {
  console.error('FAIL: mobile main padding-bottom missing batch safe inset', mobile.mainPad);
  process.exit(1);
}
if (tablet.mainPad < 200) {
  console.error('FAIL: tablet main padding-bottom missing batch safe inset', tablet.mainPad);
  process.exit(1);
}
if (mobile.overflowX) {
  console.error('FAIL: mobile overflowX');
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop min btn', Math.min(...desktop.buttons.map((b) => b.height)), 'mainPad', desktop.mainPad);
console.log('tablet min btn', Math.min(...tablet.buttons.map((b) => b.height)), 'mainPad', tablet.mainPad);
console.log('mobile min btn', mobileMin, 'mainPad', mobile.mainPad);
