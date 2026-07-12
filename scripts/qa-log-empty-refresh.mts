import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-149-log-empty');
mkdirSync(outDir, { recursive: true });

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-log-empty-'));
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
  // Force true-empty markup for visual QA (demo may have no logs already).
  await page.evaluate(() => {
    const body = document.getElementById('logsBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="11" class="empty log-empty-cell"><div class="log-empty-state empty"><div class="empty-kicker">请求日志</div><h3>暂无请求日志</h3><p>代理收到客户端请求后，会在这里记录状态、延迟、尝试次数和密钥链路。可先刷新载入最近窗口，或从客户端发起一次探测请求。</p><div class="trace-empty-steps"><span>刷新日志</span><span>发起请求</span><span>可导出 CSV</span></div><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="refresh-logs">刷新日志</button><span>重新载入最近请求窗口</span></div></div></td></tr>';
  });
  await page.waitForSelector('button[data-empty-action="refresh-logs"]');
  await page.waitForTimeout(200);
  const box = await page.locator('button[data-empty-action="refresh-logs"]').boundingBox();
  await page.locator('.log-empty-state').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(outDir, `${name}-empty.png`), fullPage: false });
  const metrics = { h: box?.height || 0, w: box?.width || 0 };
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

if (Math.round(mobile.h) < 36) {
  console.error('FAIL: mobile refresh CTA short', mobile);
  process.exit(1);
}
console.log('QA screenshots written to', outDir);
console.log('desktop', desktop.h, 'mobile', mobile.h);
