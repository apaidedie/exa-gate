import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'qa-key-detail-first-run');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-detail-'));
const upstream = await createFakeExa(() => ({ status: 200, body: { results: [] } }));

const config: ProxyConfig = {
  host: '127.0.0.1',
  port: 0,
  upstreamUrl: upstream.url,
  keys: [],
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
  await page.fill('#loginToken', 'admin_local_token');
  await page.click('#loginButton');
  await page.waitForSelector('[data-console-shell]');
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.waitForSelector('.first-run-empty');
  await page.waitForFunction(() => Boolean(
    document.querySelector('#detailsBody .key-detail-empty.first-run') ||
    document.querySelector('#mobileDetailsBody .key-detail-empty.first-run')
  ));
  // On narrow viewports the mobile detail panel stays collapsed until selection;
  // force it open for visual evidence of the injected first-run detail empty.
  if (width <= 760) {
    await page.evaluate(() => {
      const panel = document.getElementById('mobileDetails');
      if (panel) panel.classList.add('is-open');
    });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: join(outDir, `${name}-first-run.png`), fullPage: false });
  const metrics = await page.evaluate((isMobile) => {
    const desktop = document.querySelector('#detailsBody .key-detail-empty.first-run');
    const mobile = document.querySelector('#mobileDetailsBody .key-detail-empty.first-run');
    const target = isMobile ? (mobile || desktop) : (desktop || mobile);
    const btn = target?.querySelector('button[data-empty-action="import"]') as HTMLButtonElement | null;
    const rect = btn?.getBoundingClientRect();
    return {
      hasDetail: Boolean(target),
      title: target?.querySelector('h3')?.textContent || '',
      buttonText: btn?.textContent || '',
      buttonHeight: rect?.height || 0,
      buttonWidth: rect?.width || 0,
      desktopPresent: Boolean(desktop),
      mobilePresent: Boolean(mobile)
    };
  }, width <= 760);
  await page.close();
  return { overflow, metrics };
}

const desktop = await capture('desktop-1280', 1280);
const mobile = await capture('mobile-390', 390);
console.log(JSON.stringify({ outDir, desktop, mobile }, null, 2));

await browser.close();
await app.close();
await upstream.app.close();
rmSync(stateDir, { recursive: true, force: true });

if (desktop.overflow > 1 || mobile.overflow > 1) process.exit(1);
if (!desktop.metrics.hasDetail || !desktop.metrics.desktopPresent || desktop.metrics.buttonHeight < 36) process.exit(1);
if (!mobile.metrics.hasDetail || !mobile.metrics.mobilePresent || mobile.metrics.buttonHeight < 36) process.exit(1);
if (mobile.metrics.buttonWidth > 360) {
  console.error('Mobile import button too wide', mobile.metrics);
  process.exit(1);
}
console.log('Visual QA passed');
