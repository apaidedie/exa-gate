import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-141-log-links');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-log-links-'));
const upstream = await createFakeExa(() => ({ status: 200, body: { results: [] } }));

// Seed enough keys so logs from demo traffic aren't required; inject via admin after login is hard.
// Instead use app that may have empty logs - we'll still measure styles via injected HTML if needed.
// Prefer real UI: create logs by proxy? For QA, measure after opening logs tab; if empty, inject one row via evaluate.

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

async function seedProxyLog() {
  // Hit proxy with client token so a log row appears
  await fetch(baseUrl + '/search', {
    method: 'POST',
    headers: {
      authorization: 'Bearer client_local_token',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query: 'touch-target-seed' })
  }).catch(() => {});
}

async function capture(name: string, width: number, height = 844) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width <= 430
  });
  await seedProxyLog();
  await page.goto(baseUrl);
  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await page.waitForSelector('[data-console-shell]');
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.waitForTimeout(400);
  // If still empty, inject measurement buttons into logsBody for CSS proof only
  const hasLink = await page.locator('#logsBody .link-btn[data-trace-id]').count();
  if (!hasLink) {
    await page.evaluate(() => {
      const body = document.getElementById('logsBody');
      if (!body) return;
      body.innerHTML = '<tr><td></td><td><button class="link-btn" data-trace-id="req_seed" type="button">req_seed</button></td><td></td><td></td><td><button class="log-key-link" type="button" data-log-key-action="open-detail" data-key-id="key_01_search">key_01</button></td></tr>';
    });
  }
  await page.waitForTimeout(80);
  const metrics = await page.evaluate(() => {
    const link = document.querySelector('#logsBody .link-btn[data-trace-id]') as HTMLElement | null;
    const key = document.querySelector('#logsBody .log-key-link, #tracePanel .log-key-link') as HTMLElement | null;
    const short = document.querySelector('#tracePanel .trace-shortcut') as HTMLElement | null;
    const lr = link?.getBoundingClientRect();
    const kr = key?.getBoundingClientRect();
    const sr = short?.getBoundingClientRect();
    return {
      linkH: lr?.height || 0,
      linkW: lr?.width || 0,
      keyH: kr?.height || 0,
      keyW: kr?.width || 0,
      shortH: sr?.height || 0
    };
  });
  await page.screenshot({ path: join(outDir, `${name}-logs.png`), fullPage: false });
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

if (Math.round(mobile.linkH) < 44 || Math.round(tablet.linkH) < 44) {
  console.error('FAIL: link-btn below 44', { mobile, tablet });
  process.exit(1);
}
if (mobile.keyH && Math.round(mobile.keyH) < 44) {
  console.error('FAIL: log-key-link below 44', mobile);
  process.exit(1);
}
if (desktop.linkH > 36) {
  console.error('FAIL: desktop link tall', desktop.linkH);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop link', desktop.linkH, 'mobile', mobile.linkH, 'tablet', tablet.linkH);
