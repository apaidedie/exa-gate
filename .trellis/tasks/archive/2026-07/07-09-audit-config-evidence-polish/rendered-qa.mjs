import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.AUDIT_CONFIG_QA_URL;
if (!baseUrl) throw new Error('AUDIT_CONFIG_QA_URL is required');

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

mkdirSync('output/playwright/audit-config-evidence', { recursive: true });
const browser = await chromium.launch();

function assertVisibleMap(viewport, visible) {
  for (const [name, ok] of Object.entries(visible)) {
    if (!ok) throw new Error(`${viewport}: ${name} is not visible`);
  }
}

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('[data-console-shell]');
    await page.getByRole('tab', { name: '审计与配置' }).click();
    await page.waitForSelector('[data-tab-panel="audit"].active');
    await page.waitForFunction(() => document.querySelector('#auditEvidenceExport')?.textContent?.includes('可导出'));
    await page.waitForFunction(() => document.querySelector('#configEvidenceState')?.textContent?.trim().length > 2);
    await page.evaluate(() => document.querySelector('#configEvidence')?.scrollIntoView({ block: 'nearest' }));

    const metrics = await page.evaluate(() => {
      const visibleRect = (rect) => Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
      const doc = document.documentElement;
      const ids = ['auditEvidence', 'configEvidence', 'auditList'];
      const visible = Object.fromEntries(ids.map((id) => {
        const node = document.getElementById(id);
        return [id, visibleRect(node?.getBoundingClientRect())];
      }));
      const auditItems = Array.from(document.querySelectorAll('.audit-evidence-item')).map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, text: node.textContent || '' };
      });
      const configItems = Array.from(document.querySelectorAll('.config-evidence-item')).map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, text: node.textContent || '' };
      });
      return {
        overflowX: doc.scrollWidth - doc.clientWidth,
        auditText: document.getElementById('auditEvidence')?.textContent || '',
        configText: document.getElementById('configEvidence')?.textContent || '',
        auditRows: document.querySelectorAll('#auditList .audit-item').length,
        auditItems,
        configItems,
        visible
      };
    });

    await page.screenshot({ path: `output/playwright/audit-config-evidence/${viewport.name}.png`, fullPage: true });
    if (metrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX ${metrics.overflowX}`);
    if (!metrics.auditText.includes('已载入证据') || !metrics.auditText.includes('导出状态')) throw new Error(`${viewport.name}: missing audit evidence copy`);
    if (!metrics.configText.includes('HTTPS 管理') || !metrics.configText.includes('状态存储')) throw new Error(`${viewport.name}: missing config evidence copy`);
    if (metrics.auditRows < 1) throw new Error(`${viewport.name}: no audit rows rendered`);
    assertVisibleMap(viewport.name, metrics.visible);
    for (const item of [...metrics.auditItems, ...metrics.configItems]) {
      if (item.width < 80 || item.height < 40) throw new Error(`${viewport.name}: evidence item too small ${JSON.stringify(item)}`);
      if (!item.text.trim()) throw new Error(`${viewport.name}: empty evidence item`);
    }
    console.log(JSON.stringify({ viewport: viewport.name, ...metrics, auditText: undefined, configText: undefined }));
    await page.close();
  }
} finally {
  await browser.close();
}
