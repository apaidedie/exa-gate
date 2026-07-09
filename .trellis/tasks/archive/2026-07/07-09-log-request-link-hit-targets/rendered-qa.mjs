import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = Number(process.env.EXA_LOG_LINK_QA_PORT || 8797);
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
  await page.waitForSelector('#keysBody tr[data-key-id="key_01_search"]', { state: 'visible' });
  await page.getByRole('tab', { name: '请求日志' }).click();
  await page.waitForSelector('[data-tab-panel="logs"].active #logsBody button[data-trace-id]');
  await page.waitForSelector('#tracePanel .trace-shortcut', { state: 'visible' });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const intersect = (a, b) => {
      const left = Math.max(a.left, b.left);
      const top = Math.max(a.top, b.top);
      const right = Math.min(a.right, b.right);
      const bottom = Math.min(a.bottom, b.bottom);
      return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    };
    const clippedRect = (node) => {
      const own = node.getBoundingClientRect();
      let clipped = intersect(own, viewport);
      let parent = node.parentElement;
      while (parent) {
        const style = getComputedStyle(parent);
        if (/(auto|hidden|scroll|clip)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
          clipped = intersect(clipped, parent.getBoundingClientRect());
        }
        parent = parent.parentElement;
      }
      return clipped;
    };
    const centerHitTarget = (node, rect) => {
      if (rect.width <= 0 || rect.height <= 0) return false;
      const x = Math.min(rect.right - 1, Math.max(rect.left + 1, rect.left + rect.width / 2));
      const y = Math.min(rect.bottom - 1, Math.max(rect.top + 1, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit && (hit === node || node.contains(hit)));
    };
    const links = Array.from(document.querySelectorAll('#logsBody .link-btn[data-trace-id]')).map((node) => {
      const own = node.getBoundingClientRect();
      const rect = clippedRect(node);
      return {
        text: node.textContent || '',
        title: node.getAttribute('title') || '',
        visible: rect.width > 0 && rect.height > 0,
        hitTarget: centerHitTarget(node, rect),
        width: own.width,
        height: own.height,
        visibleWidth: rect.width,
        visibleHeight: rect.height,
        overflowX: node.scrollWidth - Math.ceil(node.clientWidth),
        overflowY: node.scrollHeight - Math.ceil(node.clientHeight),
        rect
      };
    }).filter((item) => item.visible && item.hitTarget).slice(0, 8);
    const shortcuts = Array.from(document.querySelectorAll('#tracePanel .trace-shortcut')).map((node) => {
      const own = node.getBoundingClientRect();
      const rect = clippedRect(node);
      return {
        text: node.textContent || '',
        visible: rect.width > 0 && rect.height > 0,
        hitTarget: centerHitTarget(node, rect),
        width: own.width,
        height: own.height,
        visibleWidth: rect.width,
        visibleHeight: rect.height,
        overflowX: node.scrollWidth - Math.ceil(node.clientWidth),
        overflowY: node.scrollHeight - Math.ceil(node.clientHeight),
        rect
      };
    }).filter((item) => item.visible && item.hitTarget);
    const overlaps = [];
    for (const link of links) {
      for (const shortcut of shortcuts) {
        const overlap = intersect(link.rect, shortcut.rect);
        if (overlap.width > 1 && overlap.height > 1) overlaps.push({ link: link.text, shortcut: shortcut.text, width: overlap.width, height: overlap.height });
      }
    }
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      links,
      shortcuts,
      overlaps
    };
  });
}

function assertMetrics(name, metrics) {
  assert(metrics.overflowX <= 1, `${name}: document overflowed horizontally by ${metrics.overflowX}px`);
  assert(metrics.links.length > 0, `${name}: no visible request links measured`);
  assert(metrics.shortcuts.length > 0, `${name}: no visible trace shortcuts measured`);
  assert(metrics.overlaps.length === 0, `${name}: request links overlap trace shortcuts ${JSON.stringify(metrics.overlaps)}`);
  for (const link of metrics.links) {
    assert(link.title.startsWith('req_'), `${name}: request link lost full title (${link.title})`);
    assert(!link.text.startsWith('req_') || link.text.length <= 12, `${name}: request link label is not compact (${link.text})`);
    assert(link.width >= 68, `${name}: request link target too narrow (${link.width}px)`);
    assert(link.height >= 24, `${name}: request link target too short (${link.height}px)`);
    assert(link.overflowX <= 1, `${name}: request link clips horizontally by ${link.overflowX}px (${link.text})`);
    assert(link.overflowY <= 1, `${name}: request link clips vertically by ${link.overflowY}px (${link.text})`);
  }
  for (const shortcut of metrics.shortcuts) {
    assert(shortcut.height >= 28, `${name}: trace shortcut target too short (${shortcut.height}px)`);
    assert(shortcut.overflowX <= 1, `${name}: trace shortcut clips horizontally by ${shortcut.overflowX}px (${shortcut.text})`);
    assert(shortcut.overflowY <= 1, `${name}: trace shortcut clips vertically by ${shortcut.overflowY}px (${shortcut.text})`);
  }
}

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'narrow', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844, isMobile: true }
];

try {
  await waitForDemo();
  mkdirSync('output/playwright/log-request-link-hit-targets', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: Boolean(viewport.isMobile) });
      await login(page);
      const metrics = await collectMetrics(page);
      assertMetrics(viewport.name, metrics);
      await page.screenshot({ path: `output/playwright/log-request-link-hit-targets/${viewport.name}.png`, fullPage: false });
      console.log(JSON.stringify({ viewport: viewport.name, overflowX: metrics.overflowX, links: metrics.links, shortcuts: metrics.shortcuts }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('Log request link hit-target QA passed.');
} finally {
  await stopDemo();
}
