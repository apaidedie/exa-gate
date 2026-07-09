import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.KEY_DETAIL_QA_URL;
if (!baseUrl) throw new Error('KEY_DETAIL_QA_URL is required');

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

mkdirSync('output/playwright/key-detail-command-panel', { recursive: true });
const browser = await chromium.launch();

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('[data-console-shell]');
    await page.getByRole('tab', { name: '密钥池' }).click();
    await page.waitForSelector('#keysBody tr[data-key-id="key_01_search"]');
    await page.locator('#keysBody tr[data-key-id="key_01_search"] button[data-action="select"]').click();

    const detailTarget = viewport.name === 'mobile' ? '#mobileDetailsBody' : '#detailsBody';
    await page.waitForFunction(({ detailTarget }) => document.querySelector(detailTarget)?.textContent?.includes('已打开密钥'), { detailTarget });
    await page.locator(`${detailTarget} .detail-hero`).waitFor({ state: 'visible' });
    const firstViewportMetrics = await page.evaluate(({ detailTarget }) => {
      const visibleRect = (rect) => Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
      const doc = document.documentElement;
      const detail = document.querySelector(detailTarget);
      const hero = detail?.querySelector('.detail-hero')?.getBoundingClientRect();
      const health = detail?.querySelector('.detail-health')?.getBoundingClientRect();
      const diagnostics = detail?.querySelector('.detail-diagnostics')?.getBoundingClientRect();
      return {
        overflowX: doc.scrollWidth - doc.clientWidth,
        heroVisible: visibleRect(hero),
        healthVisible: visibleRect(health),
        diagnosticsVisible: visibleRect(diagnostics),
        detailText: detail?.textContent || ''
      };
    }, { detailTarget });

    await page.evaluate(({ detailTarget }) => {
      document.querySelector(`${detailTarget} .detail-actions`)?.scrollIntoView({ block: 'nearest' });
    }, { detailTarget });
    await page.evaluate(() => {
      const checkbox = document.querySelector('#keysBody tr[data-key-id="key_01_search"] input.key-checkbox');
      if (!(checkbox instanceof HTMLInputElement)) throw new Error('key checkbox not found');
      if (!checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.locator('#batchBar').waitFor({ state: 'visible' });

    const reachabilityMetrics = await page.evaluate(({ detailTarget }) => {
      const visibleRect = (rect) => Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
      const ids = ['batchEnableSelected', 'batchDisableSelected', 'batchResetSelected', 'batchTestSelected'];
      const batchButtons = Object.fromEntries(ids.map((id) => {
        const node = document.getElementById(id);
        const rect = node?.getBoundingClientRect();
        return [id, { visible: visibleRect(rect), width: rect?.width || 0, height: rect?.height || 0 }];
      }));
      const detail = document.querySelector(detailTarget);
      const actions = detail?.querySelector('.detail-actions')?.getBoundingClientRect();
      const batch = document.getElementById('batchBar')?.getBoundingClientRect();
      return {
        actionsVisible: visibleRect(actions),
        batchVisible: visibleRect(batch),
        batchHeight: batch?.height || 0,
        batchButtons
      };
    }, { detailTarget });

    await page.screenshot({ path: `output/playwright/key-detail-command-panel/${viewport.name}.png`, fullPage: true });
    if (firstViewportMetrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX ${firstViewportMetrics.overflowX}`);
    for (const key of ['heroVisible', 'healthVisible', 'diagnosticsVisible']) {
      if (!firstViewportMetrics[key]) throw new Error(`${viewport.name}: ${key} failed`);
    }
    for (const key of ['actionsVisible', 'batchVisible']) {
      if (!reachabilityMetrics[key]) throw new Error(`${viewport.name}: ${key} failed`);
    }
    for (const [id, rect] of Object.entries(reachabilityMetrics.batchButtons)) {
      if (!rect.visible || rect.width < 32 || rect.height < 32) throw new Error(`${viewport.name}: ${id} target too small ${JSON.stringify(rect)}`);
    }
    for (const text of ['当前密钥', '调度', '冷却处理', '最近失败原因', '操作反馈']) {
      if (!firstViewportMetrics.detailText.includes(text)) throw new Error(`${viewport.name}: missing detail text ${text}`);
    }
    console.log(JSON.stringify({ viewport: viewport.name, ...firstViewportMetrics, detailText: undefined, reachability: reachabilityMetrics }));
    await page.close();
  }
} finally {
  await browser.close();
}
