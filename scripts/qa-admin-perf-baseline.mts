import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-157-perf-baseline');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-perf-baseline-'));
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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const timings: Record<string, number> = {};
const mark = async (name: string, fn: () => Promise<void>) => {
  const t0 = Date.now();
  await fn();
  timings[name] = Date.now() - t0;
};

await mark('goto_login', async () => {
  await page.goto(baseUrl);
  await page.waitForSelector('#loginButton');
});

await mark('login_to_shell', async () => {
  await page.click('#fillDemoToken');
  await page.click('#loginButton');
  await page.waitForSelector('[data-console-shell]');
});

await mark('tab_overview', async () => {
  await page.getByRole('tab', { name: '概览' }).click();
  await page.waitForSelector('[data-tab-panel="overview"]');
});

await mark('tab_keys', async () => {
  await page.getByRole('tab', { name: '密钥池' }).click();
  await page.waitForSelector('[data-tab-panel="keys"]');
  await page.waitForSelector('#keysBody');
});

await mark('tab_logs', async () => {
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.waitForSelector('[data-tab-panel="logs"]');
  await page.waitForSelector('#logsBody');
});

await mark('tab_audit', async () => {
  await page.getByRole('tab', { name: /审计/ }).click();
  await page.waitForSelector('[data-tab-panel="audit"], #auditList');
});

await mark('open_command_palette', async () => {
  await page.click('#openCommandPalette');
  await page.waitForSelector('#commandSearch');
  await page.waitForSelector('#commandList, #commandEmpty');
});

await mark('close_command_palette', async () => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const palette = document.getElementById('commandPalette');
    return !palette || palette.hidden || !palette.classList.contains('is-open');
  });
});

// 390 mobile pass for primary tabs
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true
});
const mobileTimings: Record<string, number> = {};
const markMobile = async (name: string, fn: () => Promise<void>) => {
  const t0 = Date.now();
  await fn();
  mobileTimings[name] = Date.now() - t0;
};

await markMobile('mobile_goto_login', async () => {
  await mobile.goto(baseUrl);
  await mobile.waitForSelector('#loginButton');
});
await markMobile('mobile_login_to_shell', async () => {
  await mobile.click('#fillDemoToken');
  await mobile.click('#loginButton');
  await mobile.waitForSelector('[data-console-shell]');
});
await markMobile('mobile_tab_keys', async () => {
  await mobile.getByRole('tab', { name: '密钥池' }).click();
  await mobile.waitForSelector('[data-tab-panel="keys"]');
});
await markMobile('mobile_tab_logs', async () => {
  await mobile.getByRole('tab', { name: '请求日志' }).click();
  await mobile.waitForSelector('[data-tab-panel="logs"]');
});

await page.screenshot({ path: join(outDir, 'desktop-after-tabs.png'), fullPage: false });
await mobile.screenshot({ path: join(outDir, 'mobile-logs.png'), fullPage: false });

const report = {
  measuredAt: new Date().toISOString(),
  env: {
    platform: process.platform,
    node: process.version,
    viewportDesktop: '1440x960',
    viewportMobile: '390x844',
    dataScale: { keys: 1, logs: 0, notes: 'local buildApp + fakeExa silent' }
  },
  desktopMs: timings,
  mobileMs: mobileTimings,
  notes: [
    'Baseline only — no product rewrite in this unit.',
    'Times include Playwright waitForSelector (network+render+main thread).',
    'Re-run before claiming regressions; single-sample noise expected.'
  ]
};

writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
console.log('QA baseline written to', outDir);

await browser.close();
await new Promise<void>((resolve, reject) => {
  app.close((err?: Error) => (err ? reject(err) : resolve()));
});
try { upstream.close(); } catch {}
rmSync(stateDir, { recursive: true, force: true });
