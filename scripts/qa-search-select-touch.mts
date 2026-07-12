import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-145-search-select');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-search-select-'));
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
  await page.waitForSelector('#timeRange');
  await page.waitForTimeout(200);
  const timeRange = await page.locator('#timeRange').boundingBox();
  await page.locator('#timeRange').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-timeRange.png`), fullPage: false });

  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.waitForSelector('#keySearch');
  await page.waitForTimeout(200);
  const keySearch = await page.locator('#keySearch').boundingBox();
  await page.locator('#keySearch').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-keySearch.png`), fullPage: false });

  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.waitForSelector('#logSearch');
  await page.waitForTimeout(200);
  const logSearch = await page.locator('#logSearch').boundingBox();
  await page.locator('#logSearch').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-logSearch.png`), fullPage: false });

  const metrics = {
    timeH: timeRange?.height || 0,
    keyH: keySearch?.height || 0,
    logH: logSearch?.height || 0
  };
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

const touchOk =
  Math.round(mobile.timeH) >= 44 &&
  Math.round(mobile.keyH) >= 44 &&
  Math.round(mobile.logH) >= 44 &&
  Math.round(tablet.keyH) >= 44;
if (!touchOk) {
  console.error('FAIL: mobile/tablet search/select below 44', { mobile, tablet });
  process.exit(1);
}
if (desktop.keyH > 40 || desktop.timeH > 40) {
  console.error('FAIL: desktop search/select tall', desktop);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop key', desktop.keyH, 'time', desktop.timeH, 'mobile key', mobile.keyH, 'log', mobile.logH, 'time', mobile.timeH);
