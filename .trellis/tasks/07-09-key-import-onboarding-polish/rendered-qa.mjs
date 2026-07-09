import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const baseUrl = process.env.IMPORT_QA_URL;
if (!baseUrl) throw new Error('IMPORT_QA_URL is required');

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

mkdirSync('output/playwright/import-modal-preview', { recursive: true });
const browser = await chromium.launch();

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', 'admin_local_token');
    await page.click('#loginButton');
    await page.waitForSelector('[data-console-shell]');
    await page.click('#bulkImportBtn');
    await page.waitForSelector('#importModal.modal-open');

    const before = await page.locator('#importDropzone').boundingBox();
    await page.locator('#importDropzone').dispatchEvent('dragover', {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer())
    });
    const after = await page.locator('#importDropzone').boundingBox();

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const ids = ['importModal', 'importTextarea', 'importDropzone', 'importPreview', 'cancelImport', 'confirmImport'];
      const visible = Object.fromEntries(ids.map((id) => {
        const node = document.getElementById(id);
        const rect = node?.getBoundingClientRect();
        return [id, Boolean(rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth)];
      }));
      const targets = Object.fromEntries(['importFileButton', 'cancelImport', 'confirmImport', 'closeImportModal'].map((id) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        return [id, rect ? { width: rect.width, height: rect.height } : null];
      }));
      return {
        overflowX: doc.scrollWidth - doc.clientWidth,
        modalHeight: document.getElementById('importModal')?.getBoundingClientRect().height || 0,
        viewportHeight: innerHeight,
        visible,
        targets
      };
    });

    const heightDelta = Math.abs((after?.height || 0) - (before?.height || 0));
    await page.screenshot({ path: `output/playwright/import-modal-preview/${viewport.name}.png`, fullPage: true });

    if (metrics.overflowX > 1) throw new Error(`${viewport.name}: overflowX ${metrics.overflowX}`);
    if (heightDelta > 1) throw new Error(`${viewport.name}: dropzone height shifted ${heightDelta}`);
    for (const [id, ok] of Object.entries(metrics.visible)) {
      if (!ok) throw new Error(`${viewport.name}: ${id} is not visible in viewport`);
    }
    for (const [id, rect] of Object.entries(metrics.targets)) {
      if (!rect || rect.width < 32 || rect.height < 32) throw new Error(`${viewport.name}: ${id} hit target too small ${JSON.stringify(rect)}`);
    }

    console.log(JSON.stringify({ viewport: viewport.name, ...metrics, dropzoneHeightDelta: heightDelta }));
    await page.close();
  }
} finally {
  await browser.close();
}
