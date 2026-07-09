import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.OVERVIEW_QA_URL;
if (!baseUrl) throw new Error('OVERVIEW_QA_URL is required');

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

mkdirSync('output/playwright/overview-trend-alert', { recursive: true });
const browser = await chromium.launch();

function assertVisibleMap(viewport, visible) {
  for (const [name, ok] of Object.entries(visible)) {
    if (!ok) throw new Error(`${viewport}: ${name} is not visible`);
  }
}

async function collectMetrics(page, ids) {
  return page.evaluate((ids) => {
    const visibleRect = (rect) => Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
    const doc = document.documentElement;
    const visible = Object.fromEntries(ids.map((id) => {
      const node = document.getElementById(id);
      return [id, visibleRect(node?.getBoundingClientRect())];
    }));
    const recapItems = Array.from(document.querySelectorAll('.trend-recap-item')).map((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, text: node.textContent || '' };
    });
    const alertText = document.getElementById('alertList')?.textContent || '';
    return {
      overflowX: doc.scrollWidth - doc.clientWidth,
      topbarHeight: document.querySelector('.topbar')?.getBoundingClientRect().height || 0,
      trendBarsHeight: document.getElementById('trendBars')?.getBoundingClientRect().height || 0,
      alertText,
      recapItems,
      visible
    };
  }, ids);
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('[data-console-shell]');
    await page.getByRole('tab', { name: '概览' }).click();
    await page.waitForSelector('[data-tab-panel="overview"].active');
    await page.waitForFunction(() => document.querySelector('#insightWindowText')?.textContent?.match(/趋势桶|趋势样本/));
    await page.waitForFunction(() => document.querySelector('#trendRecap')?.textContent?.includes('窗口请求'));

    const firstViewportMetrics = await collectMetrics(page, ['insightJudgement', 'insightNextAction', 'insightWindow']);

    await page.locator('#trendRecap').scrollIntoViewIfNeeded();
    await page.locator('#alertList').scrollIntoViewIfNeeded();
    const trendMetrics = await collectMetrics(page, ['trendRecap', 'trendBars', 'alertList']);
    await page.screenshot({ path: `output/playwright/overview-trend-alert/${viewport.name}.png`, fullPage: true });

    if (firstViewportMetrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX ${firstViewportMetrics.overflowX}`);
    if (trendMetrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX after trend scroll ${trendMetrics.overflowX}`);
    if (trendMetrics.trendBarsHeight < 120) throw new Error(`${viewport.name}: trend bars too short ${trendMetrics.trendBarsHeight}`);
    if (!trendMetrics.alertText.match(/建议排查|建议立即处理|当前窗口无需人工处理/)) throw new Error(`${viewport.name}: alert state copy missing`);
    assertVisibleMap(viewport.name, firstViewportMetrics.visible);
    assertVisibleMap(viewport.name, trendMetrics.visible);
    for (const item of trendMetrics.recapItems) {
      if (item.width < 80 || item.height < 40) throw new Error(`${viewport.name}: recap item too small ${JSON.stringify(item)}`);
      if (!item.text.trim()) throw new Error(`${viewport.name}: empty recap item`);
    }
    console.log(JSON.stringify({ viewport: viewport.name, firstViewport: { ...firstViewportMetrics, alertText: undefined }, trend: { ...trendMetrics, alertText: undefined } }));
    await page.close();
  }
} finally {
  await browser.close();
}
