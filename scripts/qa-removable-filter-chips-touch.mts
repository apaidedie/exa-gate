import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-140-removable-chips');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-removable-chips-'));
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
  await page.locator('#keyFilterChips .chip[data-chip="Problem"]').click();
  await page.waitForSelector('#keyFilterSummaryChips button[data-filter-remove="status"]');
  await page.waitForTimeout(80);

  const metrics = await page.evaluate(() => {
    const chip = document.querySelector('#keyFilterSummaryChips button[data-filter-remove="status"]') as HTMLElement | null;
    const muted = document.querySelector('.key-filter-chip.is-muted') as HTMLElement | null;
    const rect = chip?.getBoundingClientRect();
    const mutedRect = muted?.getBoundingClientRect();
    return {
      removableHeight: rect?.height || 0,
      removableWidth: rect?.width || 0,
      mutedHeight: mutedRect?.height || 0,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  await page.screenshot({ path: join(outDir, `${name}-key-chip.png`), fullPage: false });

  // Log removable chip
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.fill('#logSearch', 'no_match_for_chip_height');
  await page.waitForSelector('#logFilterChips button[data-filter-remove="query"]', { timeout: 8000 });
  const logMetrics = await page.evaluate(() => {
    const chip = document.querySelector('#logFilterChips button[data-filter-remove="query"]') as HTMLElement | null;
    const rect = chip?.getBoundingClientRect();
    return { height: rect?.height || 0, width: rect?.width || 0 };
  });
  await page.screenshot({ path: join(outDir, `${name}-log-chip.png`), fullPage: false });

  console.log(name, JSON.stringify({ metrics, logMetrics }, null, 2));
  await page.close();
  return { metrics, logMetrics };
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

if (Math.round(mobile.metrics.removableHeight) < 44 || Math.round(mobile.logMetrics.height) < 44 || Math.round(tablet.metrics.removableHeight) < 44) {
  console.error('FAIL: removable chips below 44px', { mobile, tablet });
  process.exit(1);
}
if (desktop.metrics.removableHeight > 36) {
  console.error('FAIL: desktop removable chips unexpectedly tall', desktop.metrics.removableHeight);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop removable', desktop.metrics.removableHeight, 'mobile', mobile.metrics.removableHeight, 'log', mobile.logMetrics.height);
