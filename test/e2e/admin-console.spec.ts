import { expect, test } from '@playwright/test';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type ProxyConfig } from '../../src/app.js';
import { createFakeExa } from '../helpers/fakeExa.js';

let app: FastifyInstance;
let upstream: Awaited<ReturnType<typeof createFakeExa>>;
let webhook: FastifyInstance;
let baseUrl = '';
let stateDir = '';
const webhookDeliveries: unknown[] = [];

async function listenUrl(server: FastifyInstance): Promise<string> {
  await server.listen({ host: '127.0.0.1', port: 0 });
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

async function seedRequest(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>): Promise<void> {
  await app.inject({
    method,
    url,
    headers: { authorization: 'Bearer client_local_token', 'content-type': 'application/json' },
    payload
  });
}

test.beforeAll(async () => {
  stateDir = mkdtempSync(join(tmpdir(), 'exa-e2e-'));
  upstream = await createFakeExa((request) => {
    if (request.url.includes('limited')) return { status: 429, headers: { 'retry-after': '60' }, body: { error: 'rate_limited' } };
    if (request.url.includes('fail')) return { status: 503, body: { error: 'temporary_upstream_failure' } };
    return { status: 200, body: { results: [{ id: 'ok' }], key: request.headers['x-api-key'] } };
  });

  webhook = Fastify({ logger: false });
  webhook.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  webhook.post('/*', async (request, reply) => {
    webhookDeliveries.push(request.body);
    return reply.code(204).send();
  });
  const webhookUrl = await listenUrl(webhook);

  const config: ProxyConfig = {
    host: '127.0.0.1',
    port: 0,
    upstreamUrl: upstream.url,
    keys: [
      { id: 'key_01_search', value: 'fake_key_01', weight: 1, enabled: true },
      { id: 'key_02_contents', value: 'fake_key_02', weight: 1, enabled: true },
      { id: 'key_03_backup', value: 'fake_key_03', weight: 1, enabled: true }
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
    alertWebhookUrl: webhookUrl,
    alertWebhookBearerToken: null,
    alertWebhookCooldownSeconds: 300,
    alertWebhookHmacSecret: 'e2e-signing-secret',
    alertWebhookMaxAttempts: 1,
    alertWebhookRetryBackoffMs: 1,
    trendWindowHours: 24,
    trustProxy: false,
    upstreamPoolConnections: 128,
    affinityRetentionDays: 7,
    proxyRateLimitPerMinute: 0
  };

  app = await buildApp({ config });
  baseUrl = await listenUrl(app);

  await seedRequest('POST', '/search?case=ok', { query: 'normal request' });
  await seedRequest('POST', '/search?case=limited', { query: 'rate limited request' });
  await seedRequest('POST', '/contents?case=fail', { urls: ['https://example.com'] });
  await app.inject({ method: 'POST', url: '/_proxy/keys/key_03_backup/reset-circuit', headers: { authorization: 'Bearer admin_local_token' } });
});

test.afterAll(async () => {
  await app?.close();
  await upstream?.app.close();
  await webhook?.close();
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

test('admin console covers login, key actions, logs export, and webhook testing', async ({ page }) => {
  await page.goto(baseUrl);
  await expect(page.locator('[data-login-screen]')).toBeVisible();
  await page.fill('#loginToken', 'admin_local_token');
  await page.click('#loginButton');

  await expect(page.locator('[data-console-shell]')).toBeVisible();
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"]')).toBeVisible();

  await page.fill('#keySearch', 'missing_key_for_filter_empty_state');
  await expect(page.locator('#keysBody')).toContainText('没有匹配的密钥');
  await expect(page.locator('#keysBody')).not.toContainText('还没有可调度的 Exa Key');
  await page.fill('#keySearch', '');
  await expect(page.locator('#keysBody tr[data-key-id="key_01_search"]')).toBeVisible();

  await page.click('#bulkImportBtn');
  await expect(page.locator('#importModal')).toHaveClass(/modal-open/);
  await expect(page.locator('#confirmImport')).toBeDisabled();
  await page.fill('#importTextarea', ['imported_e2e:fake_key_imported:2', 'duplicate_e2e:fake_key_imported:4', '{bad-json'].join('\n'));
  await expect(page.locator('#importPreview')).toContainText('将提交 1 个可导入密钥');
  await expect(page.locator('#importPreview')).toContainText('重复密钥已跳过');
  await expect(page.locator('#importPreview')).toContainText('JSON 格式无法解析');
  await expect(page.locator('#confirmImport')).toBeEnabled();
  await page.click('#confirmImport');
  await expect(page.locator('#importModal')).not.toHaveClass(/modal-open/);
  await page.fill('#keySearch', 'imported_e2e');
  await expect(page.locator('#keysBody tr[data-key-id="imported_e2e"]')).toBeVisible();
  await expect(page.locator('#keysBody')).not.toContainText('duplicate_e2e');
  await page.fill('#keySearch', '');

  await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]').click();
  await expect(page.locator('#detailsBody')).toContainText('key_01_search');
  await expect(page.locator('#detailsBody')).toContainText('最近失败原因');

  await page.locator('#detailsBody button[data-detail-action="test"]').click();
  await expect(page.locator('#detailsBody')).toContainText('测试密钥');
  await expect(page.locator('#detailsBody')).toContainText(/状态 200/);

  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.selectOption('#logStatusFilter', '5xx');
  await page.click('#applyLogFilters');
  await expect(page.locator('#logsBody')).toContainText('503');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportLogs');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('exa-request-logs.csv');

  await page.click('#testWebhook');
  await expect(page.locator('#toast')).toContainText(/Webhook 测试已发送|Webhook 测试失败/);
  await expect.poll(() => webhookDeliveries.length).toBeGreaterThan(0);
});

test('mobile console keeps primary navigation reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await page.fill('#loginToken', 'admin_local_token');
  await page.click('#loginButton');

  const mobileTabs = page.locator('[data-mobile-tabs]');
  await expect(page.locator('[data-console-shell]')).toBeVisible();
  await expect(mobileTabs).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();

  await mobileTabs.getByRole('tab', { name: '请求日志' }).click();
  await expect(page.locator('[data-tab-panel="logs"]')).toBeVisible();
  await expect(mobileTabs.getByRole('tab', { name: '请求日志' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#logsBody')).toContainText('503');

  await mobileTabs.getByRole('tab', { name: '审计与配置' }).click();
  await expect(page.locator('[data-tab-panel="audit"]')).toBeVisible();
  await expect(mobileTabs.getByRole('tab', { name: '审计与配置' })).toHaveAttribute('aria-selected', 'true');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('empty key pool guides first-run import', async ({ page }) => {
  const emptyApp = await buildApp({
    config: {
      host: '127.0.0.1',
      port: 0,
      upstreamUrl: upstream.url,
      keys: [],
      encryptionSecret: 'test-encryption-secret-32ch',
      proxyTokens: ['client_empty_token'],
      adminTokens: ['admin_empty_token'],
      statePath: join(stateDir, 'empty-state.sqlite'),
      selectionStrategy: 'weighted_round_robin',
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
      upstreamPoolConnections: 128,
      affinityRetentionDays: 7,
      proxyRateLimitPerMinute: 0
    }
  });

  try {
    const emptyUrl = await listenUrl(emptyApp);
    await page.goto(emptyUrl);
    await page.fill('#loginToken', 'admin_empty_token');
    await page.click('#loginButton');

    await expect(page.locator('.first-run-empty')).toBeVisible();
    await expect(page.locator('.first-run-empty')).toContainText('还没有可调度的 Exa Key');
    await page.getByRole('button', { name: '批量导入密钥' }).click();
    await expect(page.locator('#importModal')).toHaveClass(/modal-open/);
    await expect(page.locator('#importModalTitle')).toContainText('批量导入密钥');
  } finally {
    await page.close().catch(() => {});
    await emptyApp.close();
  }
});
