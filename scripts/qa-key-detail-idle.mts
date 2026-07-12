import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-151-key-detail-idle');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-key-detail-idle-'));
const upstream = await createFakeExa(() => ({ status: 200, body: { results: [] } }));

const config: ProxyConfig = {
  host: '127.0.0.1',
  port: 0,
  upstreamUrl: upstream.url,
  keys: [
    { id: 'key_01_search', value: 'fake_key_01', weight: 1, enabled: true },
    { id: 'key_02_search', value: 'fake_key_02', weight: 1, enabled: true }
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
  await page.waitForTimeout(400);
  const idleHtml = '<div class="empty key-detail-empty idle">'
    + '<div class="empty-kicker">密钥详情</div>'
    + '<h3>选择一个密钥查看详情</h3>'
    + '<p>在左侧密钥表点击一行或「详情」，这里会显示用量、冷却、最近失败和操作反馈。也可直接查看当前页首个密钥，或用搜索缩小范围。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-empty-action="select-first-key" aria-label="查看当前页首个密钥详情">查看首个密钥</button>'
    + '<button class="ghost-btn" type="button" data-empty-action="focus-key-search" aria-label="聚焦密钥搜索框">搜索密钥</button>'
    + '<span>或在表格中点选任意密钥</span>'
    + '</div></div>';
  await page.evaluate((html) => {
    for (const sel of ['.details .detail-body-target', '#mobileDetailsBody', '.detail-body-target']) {
      const node = document.querySelector(sel);
      if (node) node.innerHTML = html;
    }
    const mobile = document.getElementById('mobileDetails');
    if (mobile) {
      mobile.hidden = false;
      mobile.classList.add('is-open');
      mobile.style.display = 'block';
    }
  }, idleHtml);
  const primaryBtn = page.locator('button[data-empty-action="select-first-key"]').locator('visible=true').first();
  await primaryBtn.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(200);
  const primary = await primaryBtn.boundingBox();
  const secondary = await page.locator('button[data-empty-action="focus-key-search"]').locator('visible=true').first().boundingBox();
  await primaryBtn.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-idle.png`), fullPage: false });

  await primaryBtn.click();
  await page.waitForTimeout(400);
  const selected = await page.locator('#keysBody tr.selected').count();
  const metrics = {
    primaryH: primary?.height || 0,
    secondaryH: secondary?.height || 0,
    selectedAfter: selected
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
if (desktop.primaryH < 30) {
  console.error('FAIL: desktop primary missing', desktop);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.primaryH, 'mobile', mobile.primaryH, 'selected', desktop.selectedAfter);
