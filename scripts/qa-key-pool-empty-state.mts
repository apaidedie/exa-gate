import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'qa-key-pool-empty-state');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-empty-'));
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

async function capture(name: string, width: number) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(baseUrl);
  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await page.waitForSelector('[data-console-shell]');
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.waitForSelector('#keysBody tr[data-key-id]');
  await page.fill('#keySearch', 'missing_key_for_filter_empty_state');
  await page.waitForSelector('.key-empty-state');
  await page.locator('.key-empty-state').scrollIntoViewIfNeeded();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(outDir, `${name}-filtered.png`), fullPage: false });
  const emptyMetrics = await page.evaluate(() => {
    const empty = document.querySelector('.key-empty-state');
    const btn = document.querySelector('button[data-empty-action="clear-filters"]') as HTMLButtonElement | null;
    const rect = empty?.getBoundingClientRect();
    const btnRect = btn?.getBoundingClientRect();
    return {
      emptyVisible: Boolean(empty),
      title: empty?.querySelector('h3')?.textContent || '',
      kicker: empty?.querySelector('.empty-kicker')?.textContent || '',
      buttonText: btn?.textContent || '',
      buttonHeight: btnRect?.height || 0,
      emptyWidth: rect?.width || 0,
      emptyHeight: rect?.height || 0
    };
  });
  await page.locator('#keysBody button[data-empty-action="clear-filters"]').click();
  await page.waitForSelector('#keysBody tr[data-key-id]');
  await page.screenshot({ path: join(outDir, `${name}-after-clear.png`), fullPage: false });
  await page.close();
  return { overflow, emptyMetrics };
}

const desktop = await capture('desktop-1280', 1280);
const mobile = await capture('mobile-390', 390);

console.log(JSON.stringify({ outDir, desktop, mobile }, null, 2));

await browser.close();
await app.close();
await upstream.app.close();
rmSync(stateDir, { recursive: true, force: true });

if (desktop.overflow > 1 || mobile.overflow > 1) {
  console.error('Horizontal overflow detected');
  process.exit(1);
}
if (!desktop.emptyMetrics.emptyVisible || desktop.emptyMetrics.buttonHeight < 36) {
  console.error('Desktop empty state metrics failed', desktop.emptyMetrics);
  process.exit(1);
}
if (!mobile.emptyMetrics.emptyVisible || mobile.emptyMetrics.buttonHeight < 36) {
  console.error('Mobile empty state metrics failed', mobile.emptyMetrics);
  process.exit(1);
}
console.log('Visual QA passed');
