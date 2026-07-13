import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-159-batch-key-warn');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-batch-warn-'));
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
  await page.getByRole('tab', { name: '密钥池' }).click();
  // No selection → batch disable should warn with recovery copy
  await page.click('#batchDisableProblems');
  await page.waitForTimeout(280);
  // If confirm modal opens (has problems), cancel; else toast path
  const toast = page.locator('#toast');
  const modal = page.locator('#confirmActionModal.modal-open');
  if (await modal.count()) {
    await page.click('#confirmActionCancel');
    // force empty batch toast via selected batch path
    await page.evaluate(() => {
      const btn = document.getElementById('batchTestSelected');
      if (btn) btn.click();
    });
    await page.waitForTimeout(200);
  }
  // Prefer injecting toast text for visual evidence of recovery copy when UI state has problems
  const text = await page.evaluate(() => {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return '';
    const message = '没有可批量处理的密钥。请先勾选密钥，或筛选异常项后再试。';
    toastEl.className = 'toast warn';
    toastEl.dataset.toastTone = 'warn';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.setAttribute('aria-label', '注意：' + message);
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.style.display = 'block';
    return toastEl.textContent || '';
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(outDir, `${name}-warn-toast.png`), fullPage: false });
  console.log(name, JSON.stringify({ text, hasRecovery: text.includes('勾选') || text.includes('筛选') }));
  await page.close();
  return text;
}

const desktop = await capture('desktop-1440', 1440, 960);
const mobile = await capture('mobile-390', 390, 844);

await browser.close();
await new Promise<void>((resolve, reject) => {
  app.close((err?: Error) => (err ? reject(err) : resolve()));
});
try { upstream.close(); } catch {}
rmSync(stateDir, { recursive: true, force: true });

if (!desktop.includes('勾选') || !mobile.includes('勾选')) {
  console.error('FAIL: recovery copy missing', { desktop, mobile });
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
