import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-156-command-empty');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-command-empty-'));
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
  await page.click('#openCommandPalette');
  await page.waitForSelector('#commandSearch');
  await page.fill('#commandSearch', 'zzzz-no-match-xyz');
  await page.waitForTimeout(200);
  await expectVisible(page, '#commandEmpty');
  const primary = page.locator('#commandEmpty button[data-command-empty-action="clear-search"]');
  await primary.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  const primaryBox = await primary.boundingBox();
  const secondaryBox = await page.locator('#commandEmpty button[data-command-empty-action="suggest-keys"]').boundingBox();
  await page.locator('#commandEmpty').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-empty.png`), fullPage: false });

  await primary.click();
  await page.waitForTimeout(250);
  const listVisible = await page.locator('#commandList').isVisible();
  const emptyHidden = await page.locator('#commandEmpty').isHidden();
  const metrics = {
    primaryH: primaryBox?.height || 0,
    secondaryH: secondaryBox?.height || 0,
    listVisible,
    emptyHidden
  };
  console.log(name, JSON.stringify(metrics));
  await page.close();
  return metrics;
}

async function expectVisible(page: any, selector: string) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
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
if (!desktop.listVisible || !desktop.emptyHidden || !mobile.listVisible) {
  console.error('FAIL: clear-search did not restore list', { desktop, mobile });
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.primaryH, 'mobile', mobile.primaryH, 'clear ok');
