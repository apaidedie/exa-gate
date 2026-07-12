import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-150-trend-empty');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-trend-empty-'));
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
  await page.getByRole('tab', { name: '概览' }).click();
  // Force empty trend markup for visual QA (demo may already be empty).
  await page.evaluate(() => {
    const bars = document.getElementById('trendBars');
    if (!bars) return;
    bars.innerHTML = '<div class="trend-empty">'
      + '<span class="empty-kicker">等待样本</span>'
      + '<strong>当前窗口暂无趋势数据</strong>'
      + '<p>产生代理请求后，这里会按时间桶显示请求、失败和 429 压力。可先切换 1 小时 / 7 天观测窗口，或打开请求日志确认是否已有流量。</p>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-overview-signal-action="trend-focus" aria-label="调整趋势观测窗口">调整观测窗口</button>'
      + '<button class="ghost-btn" type="button" data-overview-signal-action="logs-focus" aria-label="查看请求日志确认流量">查看请求日志</button>'
      + '<span>切换窗口或核对日志</span>'
      + '</div></div>';
  });
  await page.waitForSelector('.trend-empty button[data-overview-signal-action="trend-focus"]');
  await page.waitForTimeout(200);
  const primary = await page.locator('.trend-empty button[data-overview-signal-action="trend-focus"]').boundingBox();
  const secondary = await page.locator('.trend-empty button[data-overview-signal-action="logs-focus"]').boundingBox();
  await page.locator('.trend-empty').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-trend-empty.png`), fullPage: false });
  const metrics = {
    primaryH: primary?.height || 0,
    secondaryH: secondary?.height || 0
  };
  console.log(name, JSON.stringify(metrics));
  await page.close();
  return metrics;
}

const desktop = await capture('desktop-1440', 1440, 960);
const mobile = await capture('mobile-390', 390, 844);

await browser.close();
await new Promise<void>((resolve, reject) => {
  app.close((err?: Error) => (err ? reject(err) : resolve()));
});
try { upstream.close(); } catch {}
rmSync(stateDir, { recursive: true, force: true });

if (Math.round(mobile.primaryH) < 44 || Math.round(mobile.secondaryH) < 44) {
  console.error('FAIL: mobile trend empty CTAs below 44', mobile);
  process.exit(1);
}
if (desktop.primaryH < 30) {
  console.error('FAIL: desktop primary missing', desktop);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.primaryH, desktop.secondaryH, 'mobile', mobile.primaryH, mobile.secondaryH);
