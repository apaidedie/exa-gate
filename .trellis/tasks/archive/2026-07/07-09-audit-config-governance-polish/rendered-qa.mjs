import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.AUDIT_QA_URL;
if (!baseUrl) throw new Error('AUDIT_QA_URL is required');

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

mkdirSync('output/playwright/audit-config-governance', { recursive: true });
const browser = await chromium.launch();

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('[data-console-shell]');
    await page.getByRole('tab', { name: '审计与配置' }).click();
    await page.waitForSelector('[data-tab-panel="audit"].active');

    const firstViewportMetrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const ids = ['auditTotal', 'auditLatest', 'governanceHttps', 'governanceRawKey', 'governanceRetention'];
      const visible = Object.fromEntries(ids.map((id) => {
        const node = document.getElementById(id);
        const rect = node?.getBoundingClientRect();
        return [id, Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)];
      }));
      const strip = document.querySelector('.governance-strip')?.getBoundingClientRect();
      const grid = document.querySelector('.management-grid')?.getBoundingClientRect();
      return {
        overflowX: doc.scrollWidth - doc.clientWidth,
        topbarHeight: document.querySelector('.topbar')?.getBoundingClientRect().height || 0,
        stripHeight: strip?.height || 0,
        gridTop: grid?.top || 0,
        visible
      };
    });

    await page.locator('#exportAudit').scrollIntoViewIfNeeded();
    await page.locator('#configRawKey').scrollIntoViewIfNeeded();
    const reachabilityMetrics = await page.evaluate(() => {
      const ids = ['exportAudit', 'auditList', 'configRawKey'];
      const visible = Object.fromEntries(ids.map((id) => {
        const node = document.getElementById(id);
        const rect = node?.getBoundingClientRect();
        return [id, Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)];
      }));
      const exportRect = document.getElementById('exportAudit')?.getBoundingClientRect();
      return { visible, exportTarget: exportRect ? { width: exportRect.width, height: exportRect.height } : null };
    });

    await page.screenshot({ path: `output/playwright/audit-config-governance/${viewport.name}.png`, fullPage: true });
    if (firstViewportMetrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX ${firstViewportMetrics.overflowX}`);
    for (const [id, ok] of Object.entries(firstViewportMetrics.visible)) {
      if (!ok) throw new Error(`${viewport.name}: ${id} is not visible in viewport`);
    }
    for (const [id, ok] of Object.entries(reachabilityMetrics.visible)) {
      if (!ok) throw new Error(`${viewport.name}: ${id} is not reachable after scroll`);
    }
    if (!reachabilityMetrics.exportTarget || reachabilityMetrics.exportTarget.width < 32 || reachabilityMetrics.exportTarget.height < 32) {
      throw new Error(`${viewport.name}: exportAudit target too small ${JSON.stringify(reachabilityMetrics.exportTarget)}`);
    }
    console.log(JSON.stringify({ viewport: viewport.name, ...firstViewportMetrics, reachability: reachabilityMetrics }));
    await page.close();
  }
} finally {
  await browser.close();
}
