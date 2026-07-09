import { chromium } from '@playwright/test';

const baseUrl = process.env.EXA_QA_URL || process.argv[2] || 'http://127.0.0.1:8787';
const adminToken = process.env.EXA_QA_ADMIN_TOKEN || 'admin_local_token';

const viewports = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'mobile', width: 390, height: 844 }
];

function fail(message) {
  throw new Error(message);
}

const browser = await chromium.launch();
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.fill('#loginToken', adminToken);
    await page.click('#loginButton');
    await page.locator('#bulkImportBtn').scrollIntoViewIfNeeded();
    await page.click('#bulkImportBtn');
    await page.waitForSelector('#importModal.modal-open');

    const emptyMetrics = await page.evaluate(() => {
      const modal = document.querySelector('#importModal .modal');
      const confirm = document.querySelector('#confirmImport');
      const readiness = document.querySelector('.import-readiness');
      const textarea = document.querySelector('#importTextarea');
      const html = document.documentElement;
      const rects = [modal, confirm, readiness, textarea].map((node) => node?.getBoundingClientRect()).filter(Boolean);
      return {
        overflow: html.scrollWidth - html.clientWidth,
        confirmHeight: confirm?.getBoundingClientRect().height || 0,
        modalWidth: modal?.getBoundingClientRect().width || 0,
        readinessWidth: readiness?.getBoundingClientRect().width || 0,
        textareaHeight: textarea?.getBoundingClientRect().height || 0,
        inViewport: rects.every((rect) => rect.left >= -1 && rect.right <= html.clientWidth + 1 && rect.width > 0 && rect.height > 0),
        previewText: document.querySelector('#importPreview')?.textContent || '',
        activeId: document.activeElement?.id || ''
      };
    });

    if (emptyMetrics.overflow > 1) fail(`${viewport.name}: document overflow ${emptyMetrics.overflow}px`);
    if (!emptyMetrics.inViewport) fail(`${viewport.name}: import modal controls exceed viewport bounds`);
    if (emptyMetrics.confirmHeight < 36) fail(`${viewport.name}: confirm button below 36px target`);
    if (emptyMetrics.textareaHeight < 120) fail(`${viewport.name}: textarea collapsed below usable height`);
    if (emptyMetrics.activeId !== 'importTextarea') fail(`${viewport.name}: modal did not focus textarea`);
    if (!emptyMetrics.previewText.includes('等待输入')) fail(`${viewport.name}: empty preview guidance missing`);

    await page.fill('#importTextarea', 'qa_key_01:qa_value_01:1\nqa_key_02:qa_value_01:2\n{bad-json');
    await page.waitForFunction(() => document.querySelector('#importPreview')?.textContent?.includes('可导入，但有跳过项'));
    const readyMetrics = await page.evaluate(() => {
      const html = document.documentElement;
      const preview = document.querySelector('#importPreview');
      const rect = preview?.getBoundingClientRect();
      return {
        overflow: html.scrollWidth - html.clientWidth,
        enabled: !document.querySelector('#confirmImport')?.disabled,
        previewText: preview?.textContent || '',
        previewWidth: rect?.width || 0,
        previewRight: rect?.right || 0,
        viewportWidth: html.clientWidth
      };
    });

    if (readyMetrics.overflow > 1) fail(`${viewport.name}: document overflow after preview ${readyMetrics.overflow}px`);
    if (!readyMetrics.enabled) fail(`${viewport.name}: confirm button stayed disabled for valid parsed key`);
    if (readyMetrics.previewRight > readyMetrics.viewportWidth + 1 || readyMetrics.previewWidth <= 0) fail(`${viewport.name}: preview exceeds viewport bounds`);
    if (!readyMetrics.previewText.includes('重复密钥已跳过')) fail(`${viewport.name}: duplicate preview issue missing`);
    if (!readyMetrics.previewText.includes('JSON 格式无法解析')) fail(`${viewport.name}: invalid preview issue missing`);

    await page.close();
    console.log(`${viewport.name}: import modal QA passed`);
  }
} finally {
  await browser.close();
}

