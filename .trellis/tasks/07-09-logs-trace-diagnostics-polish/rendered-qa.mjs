import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.LOGS_QA_URL;
if (!baseUrl) throw new Error('LOGS_QA_URL is required');

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

mkdirSync('output/playwright/logs-trace-diagnostics', { recursive: true });
const browser = await chromium.launch();

function assertVisibleMap(viewport, visible) {
  for (const [name, ok] of Object.entries(visible)) {
    if (!ok) throw new Error(`${viewport}: ${name} is not visible`);
  }
}

async function clickVisibleTraceButton(page, viewportName) {
  const point = await page.evaluate(() => {
    const button = document.querySelector('#logsBody button[data-trace-id]');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y)?.closest?.('button[data-trace-id]');
    if (target !== button) return null;
    return { x, y };
  });
  if (!point) throw new Error(`${viewportName}: trace button is not directly clickable`);
  await page.mouse.click(point.x, point.y);
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('[data-console-shell]');
    await page.getByRole('tab', { name: '请求日志' }).click();
    await page.waitForSelector('[data-tab-panel="logs"].active');
    await page.fill('#logSearch', '限流');
    await page.waitForFunction(() => document.querySelector('#logVisibleHint')?.textContent?.includes('匹配筛选'));
    await page.waitForFunction(() => document.querySelector('#logsBody')?.textContent?.includes('429'));
    await clickVisibleTraceButton(page, viewport.name);
    await page.waitForFunction(() => document.querySelector('#tracePanel')?.textContent?.includes('最终状态'));

    const metrics = await page.evaluate(() => {
      const visibleRect = (rect) => Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
      const doc = document.documentElement;
      const ids = ['logFilterSummary', 'logDiagnostics', 'logsBody', 'tracePanel'];
      const visible = Object.fromEntries(ids.map((id) => {
        const node = document.getElementById(id);
        return [id, visibleRect(node?.getBoundingClientRect())];
      }));
      const diagnosticItems = Array.from(document.querySelectorAll('.log-diagnostic-item')).map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, text: node.textContent || '' };
      });
      const traceItems = Array.from(document.querySelectorAll('#tracePanel .trace-item')).map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, text: node.textContent || '' };
      });
      const traceSummary = document.querySelector('#tracePanel .trace-summary')?.getBoundingClientRect();
      return {
        overflowX: doc.scrollWidth - doc.clientWidth,
        topbarHeight: document.querySelector('.topbar')?.getBoundingClientRect().height || 0,
        logText: document.getElementById('logDiagnostics')?.textContent || '',
        traceText: document.getElementById('tracePanel')?.textContent || '',
        traceSummaryVisible: visibleRect(traceSummary),
        diagnosticItems,
        traceItems,
        visible
      };
    });

    await page.screenshot({ path: `output/playwright/logs-trace-diagnostics/${viewport.name}.png`, fullPage: true });
    if (metrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX ${metrics.overflowX}`);
    if (!metrics.logText.includes('显示日志') || !metrics.logText.includes('429 压力')) throw new Error(`${viewport.name}: missing log diagnostics copy`);
    if (!metrics.traceText.includes('最终状态') || !metrics.traceText.includes('密钥链路')) throw new Error(`${viewport.name}: missing trace summary copy`);
    if (!metrics.traceSummaryVisible) throw new Error(`${viewport.name}: trace summary not visible`);
    assertVisibleMap(viewport.name, metrics.visible);
    for (const item of metrics.diagnosticItems) {
      if (item.width < 80 || item.height < 40) throw new Error(`${viewport.name}: diagnostic item too small ${JSON.stringify(item)}`);
      if (!item.text.trim()) throw new Error(`${viewport.name}: empty diagnostic item`);
    }
    if (!metrics.traceItems.length) throw new Error(`${viewport.name}: no trace items rendered`);
    for (const item of metrics.traceItems) {
      if (item.width < 220 || item.height < 32) throw new Error(`${viewport.name}: trace item too small ${JSON.stringify(item)}`);
    }
    console.log(JSON.stringify({ viewport: viewport.name, ...metrics, logText: undefined, traceText: undefined }));
    await page.close();
  }
} finally {
  await browser.close();
}
