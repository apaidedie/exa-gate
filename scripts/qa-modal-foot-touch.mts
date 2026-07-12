import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-130-modal-foot');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-modal-foot-'));
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
  await page.click('#batchDisableSelected');
  await page.waitForSelector('#confirmActionModal.modal-open', { timeout: 8000 });
  // Wait out modal-panel-enter scale so height measures are stable.
  await page.waitForTimeout(280);

  const metrics = await page.evaluate(() => {
    const ids = ['confirmActionCancel', 'confirmActionAccept'];
    const buttons = ids.map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect();
      return { id, height: rect?.height || 0, width: rect?.width || 0 };
    });
    return {
      buttons,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  await page.screenshot({ path: join(outDir, `${name}-confirm.png`), fullPage: false });
  await page.click('#confirmActionCancel');
  await page.click('#bulkImportBtn');
  await page.waitForSelector('#cancelImport', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(280);
  const importMetrics = await page.evaluate(() => {
    const ids = ['cancelImport', 'confirmImport'];
    return ids.map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect();
      return { id, height: rect?.height || 0, width: rect?.width || 0 };
    });
  });
  await page.screenshot({ path: join(outDir, `${name}-import.png`), fullPage: false });
  console.log(name, JSON.stringify({ confirm: metrics, import: importMetrics }, null, 2));
  await page.close();
  return { confirm: metrics, import: importMetrics };
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

const mobileConfirmMin = Math.min(...mobile.confirm.buttons.map((b) => b.height));
const mobileImportMin = Math.min(...mobile.import.map((b) => b.height));
if (mobileConfirmMin < 44 || mobileImportMin < 44) {
  console.error('FAIL: mobile modal foot below 44px', { mobileConfirmMin, mobileImportMin });
  process.exit(1);
}
const tabletConfirmMin = Math.min(...tablet.confirm.buttons.map((b) => b.height));
if (tabletConfirmMin < 44) {
  console.error('FAIL: tablet confirm foot below 44px', tabletConfirmMin);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop confirm min', Math.min(...desktop.confirm.buttons.map((b) => b.height)));
console.log('mobile confirm/import min', mobileConfirmMin, mobileImportMin);
console.log('tablet confirm min', tabletConfirmMin);
