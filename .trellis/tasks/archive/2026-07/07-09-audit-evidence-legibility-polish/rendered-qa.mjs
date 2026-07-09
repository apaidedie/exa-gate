import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.env.EXA_AUDIT_EVIDENCE_QA_PORT || 8795);
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
  await page.waitForSelector('[data-console-shell]');
  await page.getByRole('tab', { name: '审计与配置' }).click();
  await page.waitForSelector('[data-tab-panel="audit"].active');
  await page.waitForFunction(() => document.querySelector('#auditEvidenceExport')?.textContent?.includes('可导出'));
  await page.waitForFunction(() => document.querySelector('#configEvidenceState')?.textContent?.trim().length > 2);
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const targetIds = [
      'auditEvidenceAction',
      'configEvidenceHttpsHint',
      'configEvidenceRawKeyHint',
      'configEvidencePathsHint',
      'configEvidenceStateHint'
    ];
    const targetMetrics = targetIds.map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect();
      return {
        id,
        text: node?.textContent || '',
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        overflowX: node ? node.scrollWidth - Math.ceil(node.clientWidth) : 0,
        overflowY: node ? node.scrollHeight - Math.ceil(node.clientHeight) : 0,
        width: rect?.width || 0,
        height: rect?.height || 0
      };
    });
    const cells = Array.from(document.querySelectorAll('.audit-evidence-item, .config-evidence-item')).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent || '',
        width: rect.width,
        height: rect.height,
        overflowX: node.scrollWidth - Math.ceil(node.clientWidth),
        overflowY: node.scrollHeight - Math.ceil(node.clientHeight)
      };
    });
    const regions = ['auditEvidence', 'configEvidence', 'auditList'].map((id) => {
      const node = document.getElementById(id);
      const rect = node?.getBoundingClientRect();
      return { id, visible: Boolean(rect && rect.width > 0 && rect.height > 0), text: node?.textContent || '' };
    });
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      targetMetrics,
      cells,
      regions
    };
  });
}

function assertMetrics(name, metrics) {
  assert(metrics.overflowX <= 1, `${name}: document overflowed horizontally by ${metrics.overflowX}px`);
  for (const region of metrics.regions) {
    assert(region.visible, `${name}: ${region.id} is not laid out`);
    assert(region.text.trim(), `${name}: ${region.id} has empty text`);
  }
  for (const target of metrics.targetMetrics) {
    assert(target.visible, `${name}: ${target.id} is not visible`);
    assert(target.text.trim(), `${name}: ${target.id} has empty text`);
    assert(target.overflowX <= 1, `${name}: ${target.id} clips horizontally by ${target.overflowX}px (${target.text})`);
    assert(target.overflowY <= 1, `${name}: ${target.id} clips vertically by ${target.overflowY}px (${target.text})`);
  }
  for (const cell of metrics.cells) {
    assert(cell.text.trim(), `${name}: evidence cell has empty text`);
    assert(cell.width >= 120 || name === 'mobile', `${name}: evidence cell is too narrow (${cell.width}px)`);
    assert(cell.height >= 56, `${name}: evidence cell is too short (${cell.height}px)`);
    assert(cell.overflowX <= 1, `${name}: evidence cell clips horizontally by ${cell.overflowX}px (${cell.text})`);
    assert(cell.overflowY <= 1, `${name}: evidence cell clips vertically by ${cell.overflowY}px (${cell.text})`);
  }
}

const viewports = [
  { name: 'desktop-narrow', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

try {
  await waitForDemo();
  mkdirSync('output/playwright/audit-evidence-legibility', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: Boolean(viewport.isMobile) });
      await login(page);
      await page.locator('#configEvidence').scrollIntoViewIfNeeded();
      const metrics = await collectMetrics(page);
      assertMetrics(viewport.name, metrics);
      await page.screenshot({ path: `output/playwright/audit-evidence-legibility/${viewport.name}.png`, fullPage: true });
      console.log(JSON.stringify({ viewport: viewport.name, overflowX: metrics.overflowX, targets: metrics.targetMetrics }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('Audit evidence legibility QA passed.');
} finally {
  await stopDemo();
}
