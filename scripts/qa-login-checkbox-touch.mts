import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-142-login-checkbox');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-login-cb-'));
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
  await page.waitForSelector('#toggleLoginToken');
  const loginEye = await page.locator('#toggleLoginToken').boundingBox();
  await page.screenshot({ path: join(outDir, `${name}-login-eye.png`), fullPage: false });

  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await page.waitForSelector('[data-console-shell]');
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.waitForSelector('#keysBody input.key-checkbox');
  const checkbox = await page.locator('#keysBody input.key-checkbox').first().boundingBox();
  const selectAll = await page.locator('#selectAllKeys').boundingBox();
  await page.screenshot({ path: join(outDir, `${name}-checkbox.png`), fullPage: false });

  const metrics = {
    loginEyeH: loginEye?.height || 0,
    loginEyeW: loginEye?.width || 0,
    checkboxH: checkbox?.height || 0,
    checkboxW: checkbox?.width || 0,
    selectAllH: selectAll?.height || 0,
    selectAllW: selectAll?.width || 0
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

if (Math.round(mobile.loginEyeH) < 44 || Math.round(tablet.loginEyeH) < 44) {
  console.error('FAIL: login eye below 44', { mobile, tablet });
  process.exit(1);
}
if (Math.round(mobile.checkboxH) < 44 || Math.round(mobile.checkboxW) < 44) {
  console.error('FAIL: checkbox hit below 44', mobile);
  process.exit(1);
}
if (desktop.loginEyeH > 36) {
  console.error('FAIL: desktop login eye tall', desktop.loginEyeH);
  process.exit(1);
}
if (desktop.checkboxH > 24) {
  console.error('FAIL: desktop checkbox unexpectedly large', desktop.checkboxH);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop eye', desktop.loginEyeH, 'cb', desktop.checkboxH, 'mobile eye', mobile.loginEyeH, 'cb', mobile.checkboxH);
