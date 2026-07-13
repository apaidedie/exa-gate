import { chromium, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp, type ProxyConfig } from '../src/app.js';
import { createStateStore } from '../src/state.js';
import { createFakeExa } from '../test/helpers/fakeExa.js';

const outDir = join(process.cwd(), 'output', 'session-166-perf-baseline-multisample');
mkdirSync(outDir, { recursive: true });

const KEY_COUNT = 50;
const LOG_COUNT = 500;
const SAMPLES = 5;

async function listenUrl(app: { listen: Function }): Promise<string> {
  return new Promise((resolve, reject) => {
    app.listen({ host: '127.0.0.1', port: 0 }, (err: Error | null, address: string) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : 0;
  const median = n
    ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2)
    : 0;
  return {
    n,
    min: n ? sorted[0] : 0,
    max: n ? sorted[n - 1] : 0,
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    samples: values
  };
}

const stateDir = mkdtempSync(join(tmpdir(), 'exa-qa-perf-multi-'));
const statePath = join(stateDir, 'state.sqlite');
const upstream = await createFakeExa(() => ({ status: 200, body: { results: [] } }));

const keys = Array.from({ length: KEY_COUNT }, (_, i) => ({
  id: `key_${String(i + 1).padStart(3, '0')}`,
  value: `fake_key_value_${i + 1}`,
  weight: 1,
  enabled: i % 11 !== 0
}));

const seedStarted = Date.now();
const seed = createStateStore(statePath, keys);
for (let i = 0; i < LOG_COUNT; i++) {
  const key = keys[i % keys.length];
  const is429 = i % 10 === 0;
  const isErr = i % 7 === 0 && !is429;
  seed.recordRequestLog({
    requestId: `req_${String(i).padStart(4, '0')}`,
    tokenId: 'client_local_token',
    method: i % 2 === 0 ? 'POST' : 'GET',
    path: i % 3 === 0 ? '/search' : '/contents',
    status: is429 ? 429 : isErr ? 500 : 200,
    keyIds: [key.id],
    attempts: 1 + (i % 3),
    latencyMs: 15 + (i % 250),
    errorCode: is429 ? 'rate_limit' : isErr ? 'upstream_error' : null,
    query: i % 5 === 0 ? 'q=multi-sample' : null
  });
}
seed.close();
const seedMs = Date.now() - seedStarted;

const config: ProxyConfig = {
  host: '127.0.0.1',
  port: 0,
  upstreamUrl: upstream.url,
  keys,
  encryptionSecret: 'test-encryption-secret-32ch',
  proxyTokens: ['client_local_token'],
  adminTokens: ['admin_local_token'],
  statePath,
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

async function measureOnce(page: Page, prefix: string) {
  const out: Record<string, number> = {};
  const mark = async (name: string, fn: () => Promise<void>) => {
    const t0 = Date.now();
    await fn();
    out[`${prefix}${name}`] = Date.now() - t0;
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
    await page.waitForSelector('#keysBody tr[data-key-id], #keysBody .key-empty-state, #keysBody td');
  });
  await mark('tab_logs', async () => {
    await page.getByRole('tab', { name: '请求日志' }).click();
    await page.waitForSelector('[data-tab-panel="logs"]');
    await page.waitForSelector('#logsBody');
  });
  await mark('tab_audit', async () => {
    await page.getByRole('tab', { name: /审计/ }).click();
    await page.waitForSelector('#auditList');
  });
  return out;
}

const desktopSamples: Record<string, number>[] = [];
const mobileSamples: Record<string, number>[] = [];

for (let i = 0; i < SAMPLES; i++) {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  desktopSamples.push(await measureOnce(desktop, ''));
  if (i === 0) await desktop.screenshot({ path: join(outDir, 'desktop-keys.png'), fullPage: false });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  mobileSamples.push(await measureOnce(mobile, 'mobile_'));
  if (i === 0) await mobile.screenshot({ path: join(outDir, 'mobile-logs.png'), fullPage: false });
  await mobile.close();
  console.log(`sample ${i + 1}/${SAMPLES} done`);
}

function aggregate(samples: Record<string, number>[]) {
  const keys = new Set<string>();
  for (const s of samples) Object.keys(s).forEach((k) => keys.add(k));
  const out: Record<string, ReturnType<typeof stats>> = {};
  for (const k of keys) {
    out[k] = stats(samples.map((s) => Number(s[k] ?? 0)));
  }
  return out;
}

const desktopAgg = aggregate(desktopSamples);
const mobileAgg = aggregate(mobileSamples);

let priorScale: unknown = null;
const priorPath = join(process.cwd(), 'output', 'session-161-perf-baseline-scale', 'metrics.json');
if (existsSync(priorPath)) {
  try {
    priorScale = JSON.parse(readFileSync(priorPath, 'utf8'));
  } catch {
    priorScale = null;
  }
}

const report = {
  measuredAt: new Date().toISOString(),
  env: {
    platform: process.platform,
    node: process.version,
    viewportDesktop: '1440x960',
    viewportMobile: '390x844',
    samples: SAMPLES,
    dataScale: { keys: KEY_COUNT, logs: LOG_COUNT, seedMs, notes: 'local buildApp + fakeExa silent; seeded sqlite' }
  },
  desktopMs: desktopAgg,
  mobileMs: mobileAgg,
  compareToSession161Single: priorScale && typeof priorScale === 'object'
    ? {
        priorDesktop: (priorScale as any).desktopMs || null,
        multiMedianDesktop: Object.fromEntries(
          Object.entries(desktopAgg).map(([k, v]) => [k, (v as any).median])
        ),
        deltaMedianVsPriorMs: Object.fromEntries(
          Object.keys(desktopAgg).map((k) => {
            const prior = Number((priorScale as any).desktopMs?.[k] ?? NaN);
            const med = Number((desktopAgg as any)[k]?.median ?? NaN);
            return [k, Number.isFinite(prior) && Number.isFinite(med) ? Math.round((med - prior) * 10) / 10 : null];
          })
        )
      }
    : null,
  notes: [
    'Measure-only multi-sample baseline — no product rewrite.',
    `N=${SAMPLES} independent page sessions per viewport.`,
    'Times include Playwright waitForSelector (network+render+main thread).',
    'Prefer median over single-sample for qualitative comparisons.'
  ]
};

writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  desktopMedian: Object.fromEntries(Object.entries(desktopAgg).map(([k, v]) => [k, v.median])),
  mobileMedian: Object.fromEntries(Object.entries(mobileAgg).map(([k, v]) => [k, v.median])),
  compare: report.compareToSession161Single?.deltaMedianVsPriorMs || null
}, null, 2));
console.log('QA multi-sample baseline written to', outDir);

await browser.close();
await new Promise<void>((resolve, reject) => {
  app.close((err?: Error) => (err ? reject(err) : resolve()));
});
try { upstream.close(); } catch {}
rmSync(stateDir, { recursive: true, force: true });
