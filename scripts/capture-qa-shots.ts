// One-off visual QA capture against a running demo server (port 8787).
// Usage: npx tsx scripts/capture-qa-shots.ts
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseUrl = 'http://127.0.0.1:8787';
const outDir = resolve(process.cwd(), 'tmp/shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1728, height: 1000 }, deviceScaleFactor: 1 });

// 1. login
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-login-screen] #loginForm', { state: 'visible' });
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(outDir, '01-login.png') });

// login
await page.fill('#loginToken', 'admin_local_token');
await page.click('#loginButton');
await page.waitForSelector('.tab-panel[data-tab-panel="overview"].active', { state: 'visible' });
await page.waitForFunction(() => {
  const kpis = document.querySelector('.dash-kpi-grid')?.textContent || '';
  return !kpis.includes('待同步') && kpis.length > 40;
}, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(outDir, '02-overview.png') });

// 2. keys
await page.click('.sidebar .nav-item[data-tab="keys"]');
await page.waitForTimeout(2000);
await page.screenshot({ path: resolve(outDir, '03-keys.png') });

// key details aside
await page.locator('#keysBody tr').first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: resolve(outDir, '04-keys-detail.png') });

// 3. logs
await page.click('.sidebar .nav-item[data-tab="logs"]');
await page.waitForTimeout(2000);
await page.screenshot({ path: resolve(outDir, '05-logs.png') });

// log trace panel: click first requestId link if present
const traceLink = page.locator('#logsBody .log-key-link, #logsBody td .link-btn').first();
if (await traceLink.count()) {
  await traceLink.click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(outDir, '05b-logs-trace.png') });
}

// 4. import modal with preview
await page.click('.sidebar .nav-item[data-tab="keys"]');
await page.waitForTimeout(800);
await page.click('#bulkImportBtn');
await page.waitForTimeout(500);
await page.fill('#importTextarea', 'demo_key_alpha_001\ndemo_key_beta_002\ndemo_key_alpha_001\nid:demo_key_gamma_003:demo_key_gamma_003:2');
await page.waitForTimeout(900);
await page.screenshot({ path: resolve(outDir, '07-import-modal.png') });
await page.click('#closeImportModal');
await page.waitForTimeout(400);

// 5. command palette
await page.click('#openCommandPalette');
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(outDir, '08-command-palette.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 6. batch bar
const boxes = page.locator('#keysBody input[type="checkbox"]');
const boxCount = Math.min(await boxes.count(), 2);
for (let i = 0; i < boxCount; i += 1) await boxes.nth(i).click();
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(outDir, '09-batch-bar.png') });

// 7. mobile overview
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
const needsLogin = await mobile.locator('#loginToken').count();
if (needsLogin) {
  await mobile.fill('#loginToken', 'admin_local_token');
  await mobile.click('#loginButton');
}
await mobile.waitForSelector('.tab-panel[data-tab-panel="overview"].active', { state: 'visible' }).catch(() => {});
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: resolve(outDir, '10-mobile-overview.png') });

await browser.close();
console.log('captured to ' + outDir);
