import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.env.EXA_PREVIEW_PORT || 8787);
const baseUrl = `http://127.0.0.1:${port}`;
const authOutputPath = resolve(process.cwd(), 'docs/assets/admin-auth-entry.png');
const desktopOutputPath = resolve(process.cwd(), 'docs/assets/admin-console.png');
const mobileOutputPath = resolve(process.cwd(), 'docs/assets/admin-console-mobile.png');

const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/demo-ui-server.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, EXA_DEMO_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
server.stdout?.on('data', (chunk) => { serverOutput += String(chunk); });
server.stderr?.on('data', (chunk) => { serverOutput += String(chunk); });

async function waitForDemo(): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (server.exitCode !== null) throw new Error(`Demo server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/_proxy/live`);
      if (response.ok) return;
    } catch {
      // Server is still binding.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for demo server at ${baseUrl}.\n${serverOutput}`);
}

async function stopDemo(): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000))
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

try {
  await waitForDemo();
  mkdirSync(dirname(desktopOutputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    // Login entry: minimal production card + Caps Lock hint
    const authPage = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
    await authPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await authPage.waitForSelector('[data-login-screen] #loginForm', { state: 'visible' });
    await authPage.waitForSelector('#loginBoundaryNote', { state: 'visible' });
    await authPage.locator('#loginToken').focus();
    await authPage.evaluate(`
      const input = document.querySelector('#loginToken');
      if (!input) throw new Error('login token input missing');
      const event = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(event, 'getModifierState', { value: (key) => key === 'CapsLock' });
      input.dispatchEvent(event);
    `);
    await authPage.waitForSelector('#loginCapsHint:not([hidden])', { state: 'visible' });
    await authPage.screenshot({ path: authOutputPath, fullPage: false });
    await authPage.close();

    // Desktop overview: hero + KPI + trend + alerts (current primary surface)
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    await desktopPage.goto(baseUrl, { waitUntil: 'networkidle' });
    await desktopPage.fill('#loginToken', 'admin_local_token');
    await desktopPage.click('#loginButton');
    await desktopPage.waitForSelector('.tab-panel[data-tab-panel="overview"].active #dashHeroTitle', { state: 'visible' });
    await desktopPage.waitForFunction(() => {
      const hero = document.querySelector('#dashHeroTitle')?.textContent || '';
      const heroLine = document.querySelector('#dashHeroLine')?.textContent || '';
      const kpis = document.querySelector('.dash-kpi-grid')?.textContent || '';
      const trends = document.querySelector('#trendRecap')?.textContent || '';
      const alerts = document.querySelector('#alertList')?.textContent || '';
      const shell = document.querySelector('[data-console-shell]');
      const loading = shell?.getAttribute('data-console-loading') === 'true';
      return !loading
        && hero.length > 0
        && heroLine.length > 0
        && kpis.includes('健康密钥')
        && trends.includes('窗口请求')
        && trends.includes('峰值桶')
        && alerts.length > 0;
    });
    // Settle after silent refresh paint
    await desktopPage.waitForTimeout(400);
    await desktopPage.screenshot({ path: desktopOutputPath, fullPage: false });
    await desktopPage.close();

    // Mobile: request logs + open a trace
    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
    await mobilePage.goto(baseUrl, { waitUntil: 'networkidle' });
    await mobilePage.fill('#loginToken', 'admin_local_token');
    await mobilePage.click('#loginButton');
    await mobilePage.locator('.mobile-tab[data-tab="logs"]').click();
    await mobilePage.waitForSelector('.tab-panel[data-tab-panel="logs"].active #logsBody button[data-trace-id]', { state: 'visible' });
    await mobilePage.locator('.tab-panel[data-tab-panel="logs"].active #logsBody button[data-trace-id]').first().click();
    await mobilePage.waitForSelector('#tracePanel.is-active, #tracePanel.is-missing', { state: 'visible' });
    await mobilePage.screenshot({ path: mobileOutputPath, fullPage: false });
    await mobilePage.close();
  } finally {
    await browser.close();
  }

  console.log(`Admin Console auth preview captured: ${authOutputPath}`);
  console.log(`Admin Console desktop preview captured: ${desktopOutputPath}`);
  console.log(`Admin Console mobile preview captured: ${mobileOutputPath}`);
} finally {
  await stopDemo();
}
