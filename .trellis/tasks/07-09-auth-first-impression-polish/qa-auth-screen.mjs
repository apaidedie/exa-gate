import { chromium } from '@playwright/test';

const baseUrl = process.env.EXA_QA_URL || process.argv[2] || 'http://127.0.0.1:8787';

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
    await page.waitForSelector('[data-login-screen]');

    const metrics = await page.evaluate(() => {
      const html = document.documentElement;
      const nodes = ['.login-card', '.auth-capabilities', '#loginToken', '#fillDemoToken', '#loginButton']
        .map((selector) => document.querySelector(selector));
      const rects = nodes.map((node) => node?.getBoundingClientRect()).filter(Boolean);
      return {
        overflow: html.scrollWidth - html.clientWidth,
        inViewport: rects.every((rect) => rect.left >= -1 && rect.right <= html.clientWidth + 1 && rect.width > 0 && rect.height > 0),
        cardHeight: document.querySelector('.login-card')?.getBoundingClientRect().height || 0,
        submitHeight: document.querySelector('#loginButton')?.getBoundingClientRect().height || 0,
        demoHeight: document.querySelector('#fillDemoToken')?.getBoundingClientRect().height || 0,
        copy: document.querySelector('.auth-capabilities')?.textContent || '',
        activeId: document.activeElement?.id || ''
      };
    });

    if (metrics.overflow > 1) fail(`${viewport.name}: document overflow ${metrics.overflow}px`);
    if (!metrics.inViewport) fail(`${viewport.name}: auth controls exceed viewport bounds`);
    if (metrics.submitHeight < 40) fail(`${viewport.name}: submit button below usable target`);
    if (metrics.demoHeight < 32) fail(`${viewport.name}: demo token button below expected target`);
    if (!metrics.copy.includes('调度与熔断') || !metrics.copy.includes('仅当前浏览器')) fail(`${viewport.name}: capability summary copy missing`);

    await page.click('#fillDemoToken');
    const filled = await page.evaluate(() => ({
      token: document.querySelector('#loginToken')?.value || '',
      status: document.querySelector('#authHintStatus')?.textContent || '',
      activeId: document.activeElement?.id || ''
    }));
    if (filled.token !== 'admin_local_token') fail(`${viewport.name}: demo fill did not set token`);
    if (!filled.status.includes('服务端校验')) fail(`${viewport.name}: demo fill status missing validation copy`);
    if (filled.activeId !== 'loginButton') fail(`${viewport.name}: demo fill did not return focus to login button`);

    await page.click('#toggleLoginToken');
    const visible = await page.evaluate(() => ({
      type: document.querySelector('#loginToken')?.getAttribute('type') || '',
      label: document.querySelector('#toggleLoginToken')?.textContent || ''
    }));
    if (visible.type !== 'text' || visible.label !== '隐藏') fail(`${viewport.name}: token visibility toggle failed`);

    await page.close();
    console.log(`${viewport.name}: auth screen QA passed`);
  }
} finally {
  await browser.close();
}

