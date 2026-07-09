import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.env.EXA_KEY_TOOLBAR_QA_PORT || 8792);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/demo-ui-server.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, EXA_DEMO_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
server.stdout?.on('data', (chunk) => { serverOutput += String(chunk); });
server.stderr?.on('data', (chunk) => { serverOutput += String(chunk); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForDemo() {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (server.exitCode !== null) throw new Error(`Demo server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/_proxy/live`);
      if (response.ok) return;
    } catch {
      // Server is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for demo server at ${baseUrl}.\n${serverOutput}`);
}

async function stopDemo() {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.fill('#loginToken', 'admin_local_token');
  await page.click('#loginButton');
  await page.waitForSelector('#keyWorkflowSummary', { state: 'visible' });
  await page.waitForSelector('#keysBody tr[data-key-id="key_01_search"]', { state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `${label}: document overflowed horizontally by ${overflow}px`);
}

async function assertSummaryFlow(page, label) {
  await page.locator('#keyWorkflowSummary').scrollIntoViewIfNeeded();
  const summaryBox = await page.locator('#keyWorkflowSummary').boundingBox();
  const tableBox = await page.locator('.key-table-scroll').boundingBox();
  const minSummaryHeight = label === 'mobile' ? 36 : 50;
  assert(summaryBox && summaryBox.height >= minSummaryHeight, `${label}: workflow summary is not visibly sized`);
  assert(tableBox && summaryBox.y + summaryBox.height <= tableBox.y + 1, `${label}: workflow summary overlaps the table`);
  assert(await page.locator('#keyWorkflowScope').textContent() === '全部密钥', `${label}: initial scope did not render`);

  await page.locator('#keysBody tr[data-key-id="key_01_search"] input.key-checkbox').check();
  await page.waitForFunction(() => document.querySelector('#keyWorkflowSelected')?.textContent === '1');
  await page.locator('#keysBody tr[data-key-id="key_01_search"] input.key-checkbox').uncheck();
  await page.waitForFunction(() => document.querySelector('#keyWorkflowSelected')?.textContent === '0');

  await page.fill('#keySearch', 'missing_key_for_filter_empty_state');
  await page.waitForFunction(() => document.querySelector('#keyWorkflowVisible')?.textContent === '0');
  assert((await page.locator('#keyWorkflowScope').textContent())?.includes('missing_key_for_filter_empty_state'), `${label}: search scope did not update`);
  await page.fill('#keySearch', '');
  await page.waitForSelector('#keysBody tr[data-key-id="key_01_search"]', { state: 'visible' });
}

try {
  await waitForDemo();
  const browser = await chromium.launch();
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    await login(desktop);
    await assertSummaryFlow(desktop, 'desktop');
    await assertNoOverflow(desktop, 'desktop');
    await desktop.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
    await login(mobile);
    await assertSummaryFlow(mobile, 'mobile');
    await assertNoOverflow(mobile, 'mobile');
    await mobile.close();
  } finally {
    await browser.close();
  }
  console.log('Key toolbar workflow QA passed.');
} finally {
  await stopDemo();
}
