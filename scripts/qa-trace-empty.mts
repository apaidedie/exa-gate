import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-154-trace-empty');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-trace-empty-'));
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
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.waitForSelector('#tracePanel');
  await page.waitForTimeout(400);
  // Desktop keeps idle CTAs; ≤760 compact idle hides .empty-actions to preserve log rows.
  // For mobile visual/touch QA, use non-idle panel so recovery CTAs remain measurable.
  const compactIdle = width <= 760;
  await page.evaluate(({ compact }) => {
    const panel = document.getElementById('tracePanel');
    if (!panel) return;
    panel.className = compact ? 'trace-panel' : 'trace-panel is-idle';
    panel.innerHTML = '<div class="trace-empty-state idle">'
      + '<div class="empty-kicker">链路诊断</div>'
      + '<div class="trace-empty-copy"><h3>选择请求 ID 查看链路</h3>'
      + '<p>点击请求日志中的 requestId，可展开该请求的尝试顺序、上游路径、状态码和密钥链路。也可先刷新日志或搜索 requestId。</p></div>'
      + '<div class="trace-empty-steps"><span>点击 requestId</span><span>刷新日志</span><span>搜索 ID</span></div>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="refresh-logs">刷新日志</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="focus-log-search">搜索 requestId</button>'
      + '<span>或在表格中点击 requestId</span>'
      + '</div></div>';
  }, { compact: compactIdle });
  const primary = page.locator('#tracePanel button[data-empty-action="refresh-logs"]').first();
  await primary.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  const primaryBox = await primary.boundingBox();
  const secondaryBox = await page.locator('#tracePanel button[data-empty-action="focus-log-search"]').first().boundingBox();
  await page.locator('#tracePanel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-trace-idle.png`), fullPage: false });

  await page.locator('#tracePanel button[data-empty-action="focus-log-search"]').first().click();
  await page.waitForTimeout(250);
  const focused = await page.evaluate(() => document.activeElement?.id === 'logSearch');
  const metrics = {
    primaryH: primaryBox?.height || 0,
    secondaryH: secondaryBox?.height || 0,
    focusedSearch: focused,
    compactIdle
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

if (Math.round(mobile.primaryH) < 44) {
  console.error('FAIL: mobile primary short', mobile);
  process.exit(1);
}
if (!desktop.focusedSearch || !mobile.focusedSearch) {
  console.error('FAIL: focus-log-search did not focus #logSearch', { desktop, mobile });
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.primaryH, 'mobile', mobile.primaryH, 'focus ok');
