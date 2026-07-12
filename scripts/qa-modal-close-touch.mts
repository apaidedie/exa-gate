import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-135-modal-close');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-modal-close-'));
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
  await page.click('#batchDisableSelected');
  await page.waitForSelector('#confirmActionModal.modal-open');
  await page.waitForTimeout(280);

  const confirmMetrics = await page.evaluate(() => {
    const close = document.getElementById('closeConfirmAction');
    const rect = close?.getBoundingClientRect();
    return { closeHeight: rect?.height || 0, closeWidth: rect?.width || 0 };
  });
  await page.screenshot({ path: join(outDir, `${name}-confirm-close.png`), fullPage: false });
  await page.click('#confirmActionCancel');
  await page.click('#batchClearSelection').catch(() => {});

  // Mobile details close only on narrow viewports — force panel open for measurement.
  let mobileClose = { height: 0, width: 0, visible: false, minHeight: '' };
  if (width <= 760) {
    await page.evaluate(() => {
      const panel = document.getElementById('mobileDetails');
      if (panel) panel.classList.add('is-open');
    });
    await page.waitForTimeout(80);
    mobileClose = await page.evaluate(() => {
      const btn = document.getElementById('closeMobileDetails');
      const rect = btn?.getBoundingClientRect();
      const style = btn ? getComputedStyle(btn) : null;
      return {
        height: rect?.height || 0,
        width: rect?.width || 0,
        minHeight: style?.minHeight || '',
        visible: !!(btn && style && style.display !== 'none' && style.visibility !== 'hidden')
      };
    });
    await page.screenshot({ path: join(outDir, `${name}-mobile-details-close.png`), fullPage: false });
  }

  console.log(name, JSON.stringify({ confirmMetrics, mobileClose }, null, 2));
  await page.close();
  return { confirmMetrics, mobileClose };
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

if (Math.round(mobile.confirmMetrics.closeHeight) < 44 || Math.round(tablet.confirmMetrics.closeHeight) < 44) {
  console.error('FAIL: modal close below 44px', mobile.confirmMetrics, tablet.confirmMetrics);
  process.exit(1);
}
if (Math.round(mobile.mobileClose.height) < 44) {
  console.error('FAIL: closeMobileDetails below 44px', mobile.mobileClose);
  process.exit(1);
}
if (desktop.confirmMetrics.closeHeight > 42) {
  console.error('FAIL: desktop close unexpectedly tall', desktop.confirmMetrics.closeHeight);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop close', desktop.confirmMetrics.closeHeight, 'mobile close', mobile.confirmMetrics.closeHeight, 'mobile details close', mobile.mobileClose.height);
