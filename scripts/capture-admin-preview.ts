import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.env.EXA_PREVIEW_PORT || 8787);
const baseUrl = `http://127.0.0.1:${port}`;
const outputPath = resolve(process.cwd(), 'docs/assets/admin-console.png');

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
  mkdirSync(dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('#keysBody tr[data-key-id="key_01_search"]', { state: 'visible' });
    await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]').click();
    await page.waitForSelector('.details-sticky');
    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await browser.close();
  }

  console.log(`Admin Console preview captured: ${outputPath}`);
} finally {
  await stopDemo();
}
