import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { testConfig } from './testConfig.js';
import { createFakeExa } from './helpers/fakeExa.js';

const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
  vi.useRealTimers();
});

describe('admin api and ui', () => {
  it('keeps the admin UI in a separate static resource', () => {
    const adminSource = readFileSync('src/admin.ts', 'utf8');
    const uiSource = readFileSync('src/admin-ui/index.html', 'utf8');

    expect(adminSource).not.toContain('const adminUi = `<!doctype html>');
    expect(uiSource).toContain('<!doctype html>');
    expect(uiSource).toContain('workbench-shell');
    expect(uiSource).toContain('primary-workspace');
  });

  it('splits the admin UI into separate HTML, CSS, and JavaScript assets', async () => {
    const uiSource = readFileSync('src/admin-ui/index.html', 'utf8');
    const cssPath = 'src/admin-ui/admin.css';
    const jsPath = 'src/admin-ui/admin.js';

    expect(existsSync(cssPath)).toBe(true);
    expect(existsSync(jsPath)).toBe(true);
    expect(uiSource).toContain('<link rel="stylesheet" href="/_proxy/ui/admin.css">');
    expect(uiSource).toContain('<script type="module" src="/_proxy/ui/admin.js"></script>');
    expect(uiSource).not.toContain('<style>');
    expect(uiSource).not.toContain('<script>');
    expect(readFileSync(cssPath, 'utf8')).toContain('.console-shell');
    expect(readFileSync(jsPath, 'utf8')).toContain("from './state.js'");

    const app = await buildApp({ config: testConfig() });
    apps.push(app);
    const cssResponse = await app.inject({ method: 'GET', url: '/_proxy/ui/admin.css' });
    const jsResponse = await app.inject({ method: 'GET', url: '/_proxy/ui/admin.js' });
    const faviconResponse = await app.inject({ method: 'GET', url: '/favicon.ico' });

    expect(cssResponse.statusCode).toBe(200);
    expect(cssResponse.headers['content-type']).toContain('text/css');
    expect(cssResponse.body).toContain('.console-shell');
    expect(jsResponse.statusCode).toBe(200);
    expect(jsResponse.headers['content-type']).toContain('application/javascript');
    expect(jsResponse.body).toContain('renderObservability');
    expect(faviconResponse.statusCode).toBe(204);
  });

  it('keeps admin route responsibilities split into focused backend modules', () => {
    const adminSource = readFileSync('src/admin.ts', 'utf8');
    const expectedModules = [
      'src/admin/auth.ts',
      'src/admin/static.ts',
      'src/admin/observability.ts',
      'src/admin/keyActions.ts',
      'src/admin/webhook.ts'
    ];

    for (const modulePath of expectedModules) expect(existsSync(modulePath)).toBe(true);
    expect(adminSource).toContain("from './admin/auth.js'");
    expect(adminSource).toContain("from './admin/static.js'");
    expect(adminSource).toContain("from './admin/observability.js'");
    expect(adminSource).toContain("from './admin/keyActions.js'");
    expect(adminSource).toContain("from './admin/webhook.js'");
    expect(adminSource).not.toContain('function buildObservability');
    expect(adminSource).not.toContain('async function maybeDispatchAlertWebhook');
    expect(adminSource).not.toContain('async function testConfiguredKey');
    expect(adminSource).not.toContain('const adminUiPath');
  });

  it('serves the console with CSP headers and ES module assets', async () => {
    const uiSource = readFileSync('src/admin-ui/index.html', 'utf8');
    const expectedModules = [
      'src/admin-ui/api.js',
      'src/admin-ui/state.js',
      'src/admin-ui/renderKeys.js',
      'src/admin-ui/renderLogs.js',
      'src/admin-ui/renderObservability.js'
    ];

    for (const modulePath of expectedModules) expect(existsSync(modulePath)).toBe(true);
    expect(uiSource).toContain('<script type="module" src="/_proxy/ui/admin.js"></script>');

    const app = await buildApp({ config: testConfig() });
    apps.push(app);

    const root = await app.inject({ method: 'GET', url: '/' });
    const compat = await app.inject({ method: 'GET', url: '/_proxy/ui' });
    const moduleResponse = await app.inject({ method: 'GET', url: '/_proxy/ui/api.js' });

    for (const response of [root, compat]) {
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      expect(response.headers['content-security-policy']).toContain("style-src 'self'");
      expect(response.headers['content-security-policy']).toContain("connect-src 'self'");
      expect(response.headers['content-security-policy']).not.toContain("'unsafe-inline'");
    }
    expect(moduleResponse.statusCode).toBe(200);
    expect(moduleResponse.headers['content-type']).toContain('application/javascript');
  });

  it('serves versioned admin assets with cache headers and a manifest', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);

    const root = await app.inject({ method: 'GET', url: '/' });
    const manifest = await app.inject({ method: 'GET', url: '/_proxy/ui/asset-manifest.json' });
    const manifestJson = manifest.json();
    const cssHash = manifestJson.assets['admin.css'].hash.slice(0, 12);
    const css = await app.inject({ method: 'GET', url: `/_proxy/ui/admin.css?v=${cssHash}` });
    const moduleResponse = await app.inject({ method: 'GET', url: '/_proxy/ui/admin.js?v=' + manifestJson.assets['admin.js'].hash.slice(0, 12) });

    expect(root.statusCode).toBe(200);
    expect(root.headers['cache-control']).toContain('no-store');
    expect(root.body).toContain('/_proxy/ui/admin.css?v=' + cssHash);
    expect(root.body).toContain('/_proxy/ui/admin.js?v=' + manifestJson.assets['admin.js'].hash.slice(0, 12));
    expect(root.body).toContain('id="assetVersion"');
    expect(root.body).toContain(`版本 ${manifestJson.version}`);
    expect(root.body).not.toContain('版本 -');
    expect(manifest.statusCode).toBe(200);
    expect(manifestJson).toMatchObject({ version: expect.any(String), assets: { 'admin.css': { sha256: expect.any(String), hash: expect.any(String) } } });
    expect(css.headers['cache-control']).toContain('max-age=31536000');
    expect(css.headers['cache-control']).toContain('immutable');
    expect(css.headers['x-asset-sha256']).toBe(manifestJson.assets['admin.css'].sha256);
    expect(moduleResponse.body).toContain("./state.js?v=");
  });

  it('reports static asset integrity for the bytes actually served', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);

    const manifest = await app.inject({ method: 'GET', url: '/_proxy/ui/asset-manifest.json' });
    const adminJsHash = manifest.json().assets['admin.js'].hash;
    const response = await app.inject({ method: 'GET', url: `/_proxy/ui/admin.js?v=${adminJsHash}` });
    const servedSha256 = createHash('sha256').update(response.body).digest('hex');

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("./state.js?v=");
    expect(response.headers['x-asset-sha256']).toBe(servedSha256);
  });

  it('serves the OpenAPI contract from the running service', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/_proxy/openapi.json' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toContain('no-cache');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toBe('Exa Reverse Proxy Management API');
    expect(body.paths['/_proxy/keys']).toBeTruthy();
  });

  it('reloads admin assets between requests outside production for UI development', async () => {
    const cssPath = 'src/admin-ui/admin.css';
    const original = readFileSync(cssPath, 'utf8');
    const marker = `/* dev-reload-${Date.now()} */`;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const app = await buildApp({ config: testConfig() });
      apps.push(app);
      const before = await app.inject({ method: 'GET', url: '/_proxy/ui/admin.css' });
      writeFileSync(cssPath, `${original}\n${marker}\n`);
      const after = await app.inject({ method: 'GET', url: '/_proxy/ui/admin.css' });

      expect(before.body).not.toContain(marker);
      expect(after.body).toContain(marker);
    } finally {
      writeFileSync(cssPath, original);
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it('uses a denser operations console layout', () => {
    const uiSource = `${readFileSync('src/admin-ui/index.html', 'utf8')}\n${readFileSync('src/admin-ui/admin.css', 'utf8')}`;

    expect(uiSource).toContain('console-density-pro');
    expect(uiSource).toContain('table-scroll key-table-scroll');
    expect(uiSource).toContain('table-scroll log-table-scroll');
    expect(uiSource).toContain('management-grid');
    expect(uiSource).toContain('governance-strip');
    expect(uiSource).toContain('launch-readiness-panel');
    expect(uiSource).toContain('audit-governance-card');
    expect(uiSource).toContain('security-governance-card');
    expect(uiSource).toContain('retention-governance-card');
    expect(uiSource).toContain('grid-template-columns: 220px minmax(560px, 1fr) minmax(336px, 380px)');
    expect(uiSource).toContain('height: 100vh;');
    expect(uiSource).toContain('min-width: 0;');
    expect(uiSource).not.toContain('min-width: 1200px');
    expect(uiSource).toContain('grid-template-rows: 58px minmax(0, 1fr)');
    expect(uiSource).toContain('grid-template-columns: 220px minmax(0, 1fr)');
    expect(uiSource).toContain('min-height: 0;');
    expect(uiSource).toContain('keys-panel primary-panel');
    expect(uiSource).toContain('.primary-panel');
    expect(uiSource).toContain('refresh-status');
    expect(uiSource).toContain('sidebar');
    expect(uiSource).toContain('nav-item');
    expect(uiSource).toContain('data-mobile-tabs');
    expect(uiSource).toContain('data-tab-nav');
    expect(uiSource).toContain('.mobile-tabs');
    expect(uiSource).toContain('nav-icon nav-icon-overview');
    expect(uiSource).toContain('nav-icon nav-icon-keys');
    expect(uiSource).toContain('nav-icon nav-icon-logs');
    expect(uiSource).toContain('nav-icon nav-icon-audit');
    expect(uiSource).toContain('nav-icon nav-icon-collapse');
    expect(uiSource).toContain('.nav-icon-overview::before');
    expect(uiSource).toContain('.nav-icon-keys::before');
    expect(uiSource).toContain('.nav-icon-logs::before');
    expect(uiSource).toContain('.nav-icon-audit::before');
    expect(uiSource).toContain('.nav-icon-collapse.is-collapsed::before');
    for (const glyph of ['◇', '↪', '◈', '◐', '▤', '◉', '◁', '▷']) expect(uiSource).not.toContain(glyph);
    expect(uiSource).toContain('grid-template-rows: auto auto minmax(0, 1fr)');
    expect(uiSource).toContain('.topbar { display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch; gap: 6px; padding: 6px 12px; }');
    expect(uiSource).toContain('action-group security-group');
    expect(uiSource).toContain('action-group refresh-group');
    expect(uiSource).toContain('action-group utility-group');
    expect(uiSource).toContain('id="openCommandPalette" class="ghost-btn command-action" type="button" aria-label="打开快速操作（Ctrl K 或 Cmd K）" aria-haspopup="dialog" aria-controls="commandPalette" aria-expanded="false" aria-keyshortcuts="Control+K Meta+K"');
    expect(uiSource).toContain('id="commandPalette" class="command-palette-overlay" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle" aria-describedby="commandPaletteHint" hidden');
    expect(uiSource).toContain('id="commandSearch" class="command-search" type="search" placeholder="搜索命令、页面或操作" autocomplete="off" aria-label="搜索快速操作"');
    expect(uiSource).toContain('id="commandPaletteContext" class="command-palette-context" role="status" aria-live="polite" aria-atomic="true" aria-label="快速操作范围：待搜索。可输入关键词或方向键选择命令"');
    expect(uiSource).toContain('id="commandResultCount"');
    expect(uiSource).toContain('id="commandGroupCount"');
    expect(uiSource).toContain('id="commandSearchScope"');
    expect(uiSource).toContain('id="commandList" class="command-list" role="listbox" aria-label="快速操作列表：可搜索命令，或方向键选择后按 Enter 执行"');
    expect(uiSource).toContain('id="commandEmpty" class="command-empty" hidden');
    expect(uiSource).toContain('没有匹配的操作');
    expect(uiSource).toContain('可清空搜索恢复全部命令，或改用“密钥”“日志”“审计”“导出”“刷新”等词重试。');
    expect(uiSource).toContain('data-command-empty-action="clear-search"');
    expect(uiSource).toContain('data-command-empty-action="suggest-keys"');
    expect(uiSource).toContain('.command-palette-overlay');
    expect(uiSource).toContain('.command-palette-context');
    expect(uiSource).toContain('.command-option');
    expect(uiSource).toContain('.command-option-meta');
    expect(uiSource).toContain('.command-action');
    expect(uiSource).toContain('class="ghost-btn secret-toggle"');
    expect(uiSource).toContain('class="ghost-btn session-exit"');
    expect(uiSource).toContain('class="select refresh-interval"');
    expect(uiSource).toContain('.top-actions { flex: none; width: 100%; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-items: stretch; gap: 5px; }');
    expect(uiSource).toContain('.security-group { grid-column: span 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); order: 1; }');
    expect(uiSource).toContain('.refresh-group { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, .78fr) 58px minmax(0, .9fr) minmax(0, .82fr); order: 3; align-items: center; }');
    expect(uiSource).toContain('.top-actions .ghost-btn { min-width: 0; min-height: 44px; height: 44px;');
    expect(uiSource).toContain('panel toolbar actions beat generic 36px control rule');
    expect(uiSource).toContain('.keys-panel .toolbar .ghost-btn,');
    expect(uiSource).toContain('.log-tools .ghost-btn,');
    expect(uiSource).toContain('batch bar actions beat generic 36px control rule');
    expect(uiSource).toContain('#batchBar .batch-actions .ghost-btn,');
    expect(uiSource).toContain('#batchBar .batch-actions .primary-btn');
    expect(uiSource).toContain('.console-shell[data-batch-open] { --batch-bar-safe: 220px; }');
    expect(uiSource).toContain('.main { padding: 10px 12px 12px; padding-bottom: calc(12px + var(--batch-bar-safe, 0px)); scroll-padding-bottom: var(--batch-bar-safe, 0px); }');
    expect(uiSource).toContain('modal foot actions beat generic 36px control rule');
    expect(uiSource).toContain('.modal-foot .modal-actions .ghost-btn,');
    expect(uiSource).toContain('.modal-foot .modal-actions .danger-btn');
    expect(uiSource).toContain('.utility-group { grid-column: span 3; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); order: 2; }');
    expect(uiSource).toContain('.brand { width: 100%; min-width: 0; height: auto; min-height: 32px; }');
    expect(uiSource).toContain('.top-actions .select, .top-actions label, .refresh-status, .live-link-status { min-width: 0; min-height: 36px; padding: 0 6px; font-size: 11px; }');
    expect(uiSource).toContain('.keys-panel .toolbar { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }');
    expect(uiSource).toContain('.keys-panel #keyFilterChips { grid-column: span 3; min-height: 44px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; scrollbar-width: thin; align-items: center; gap: 8px; }');
    expect(uiSource).toContain('key status filter chips beat dense 30px chip rule on touch viewports');
    expect(uiSource).toContain('.keys-panel #keyFilterChips .chip');
    expect(uiSource).toContain('filter clear mini-btns beat dense 28–34px mini-btn rules');
    expect(uiSource).toContain('#clearKeyFilters.mini-btn,');
    expect(uiSource).toContain('#clearLogFilters.mini-btn,');
    expect(uiSource).toContain('#clearAuditFilters.mini-btn');
    expect(uiSource).toContain('key row action mini-btns beat dense 28px mini-btn rule');
    expect(uiSource).toContain('.action-cell .mini-btn');
    expect(uiSource).toContain('pager mini-btns beat dense 28px mini-btn rule');
    expect(uiSource).toContain('#prevKeyPage.mini-btn,');
    expect(uiSource).toContain('#nextKeyPage.mini-btn');
    expect(uiSource).toContain('modal dismiss controls beat dense 36px close rule');
    expect(uiSource).toContain('.command-palette-head .modal-close');
    expect(uiSource).toContain('#closeMobileDetails.ghost-btn');
    expect(uiSource).toContain('key table sort headers beat dense 28px sort-btn rule');
    expect(uiSource).toContain('.keys-panel .sort-btn');
    expect(uiSource).toContain('key enable toggle hit area ≥44px while keeping switch affordance');
    expect(uiSource).toContain('.keys-panel button.toggle');
    expect(uiSource).toContain('.keys-panel button.toggle.on::after');
    expect(uiSource).toContain('removable filter chips beat dense 26–34px chip rule on touch viewports');
    expect(uiSource).toContain('button.key-filter-chip.is-removable');
    expect(uiSource).toContain('button.log-filter-chip.is-removable');
    expect(uiSource).toContain('log requestId / key links beat dense 27–30px link rules');
    expect(uiSource).toContain('.log-panel .link-btn[data-trace-id]');
    expect(uiSource).toContain('.log-panel .log-key-link');
    expect(uiSource).toContain('.trace-panel .trace-shortcut');
    expect(uiSource).toContain('login eye + key checkboxes: first-run / batch select hit targets');
    expect(uiSource).toContain('#toggleLoginToken.login-eye');
    expect(uiSource).toContain('#selectAllKeys.key-checkbox');
    expect(uiSource).toContain('first-run demo fill + import file picker beat dense 32–36px rules');
    expect(uiSource).toContain('#fillDemoToken.demo-token-btn');
    expect(uiSource).toContain('#importFileButton.ghost-btn.file-label');
    expect(uiSource).toContain('overview next-step CTA beats dense 34px insight-action rule');
    expect(uiSource).toContain('#insightNextActionButton.insight-action');
    expect(uiSource).toContain('panel search/select beat generic 36px control rule for touch filter workflows');
    expect(uiSource).toContain('#keySearch.search');
    expect(uiSource).toContain('#logSearch.search');
    expect(uiSource).toContain('#timeRange.select');
    expect(uiSource).toContain('key workflow shortcut tiles beat dense 40px mobile rule for ≥44px touch');
    expect(uiSource).toContain('#keyWorkflowSummary .key-workflow-item');
    expect(uiSource).toContain('#keyWorkflowSummary button[data-key-workflow-action]');
    expect(uiSource).toContain('topbar refresh interval + auto-refresh toggle beat dense 36px status/control rule');
    expect(uiSource).toContain('#refreshInterval.select');
    expect(uiSource).toContain('.top-actions label.refresh-toggle');
    expect(uiSource).toContain('.keys-panel #batchTestPage, .keys-panel #batchDisableProblems, .keys-panel #bulkImportBtn { grid-column: span 2; }');
    expect(uiSource).toContain('id="keyFilterSummary" class="key-filter-summary is-empty" role="status" aria-live="polite" aria-atomic="true" aria-label="密钥筛选状态：全部密钥 · 可按关键词或状态收窄。可搜索 ID 或按状态筛选"');
    expect(uiSource).toContain('.log-filter-summary, .key-filter-summary');
    expect(uiSource).toContain('.key-filter-chip');
    expect(uiSource).toContain('.mobile-tabs { display: flex; position: relative; z-index: 2; }');
    expect(uiSource).toContain('.mobile-tabs .nav-item');
    expect(uiSource).toContain('min-height: 44px');
    expect(uiSource).toContain('.mobile-tabs .nav-item { min-width: 94px; height: 44px; min-height: 44px;');
    expect(uiSource).toContain('.top-actions .ghost-btn { min-width: 0; min-height: 44px; height: 44px;');
    expect(uiSource).toContain('id="mobileDetails" class="panel mobile-details-panel"');
    expect(uiSource).toContain('id="mobileDetailsBody" class="details-body detail-body-target"');
    expect(uiSource).toContain('id="detailsBody" class="details-body detail-body-target"');
    expect(uiSource).toContain('.mobile-details-panel { display: none; }');
    expect(uiSource).toContain('.mobile-details-panel.is-open { display: flex; border-color: rgba(135,174,251,.20); }');
  });
  it('requires admin auth and keeps raw key display ids disabled by default', async () => {
    const app = await buildApp({ config: testConfig({ keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }] }) });
    apps.push(app);

    expect((await app.inject({ method: 'GET', url: '/_proxy/keys' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/_proxy/keys', headers: { authorization: 'Bearer admin_token' } });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"id":"a"');
    expect(response.body).toContain('"displayId":"a"');
    expect(response.body).not.toContain('secret-key-a');
    expect(response.body).not.toContain('"value"');
  });

  it('can explicitly allow raw display ids for local-only deployments', async () => {
    const app = await buildApp({ config: testConfig({ allowRawKeyDisplay: true, keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }] }) });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/_proxy/keys', headers: { authorization: 'Bearer admin_token' } });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"displayId":"secret-key-a"');
    expect(response.body).not.toContain('"value"');
  });

  it('requires explicit raw-key permission and audits raw key reveal requests', async () => {
    const deniedApp = await buildApp({ config: testConfig({ keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }] }) });
    apps.push(deniedApp);

    const denied = await deniedApp.inject({ method: 'POST', url: '/_proxy/keys/a/secret', headers: { authorization: 'Bearer admin_token' } });
    expect(denied.statusCode).toBe(403);

    const app = await buildApp({ config: testConfig({ allowRawKeyDisplay: true, keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }] }) });
    apps.push(app);
    const revealed = await app.inject({ method: 'POST', url: '/_proxy/keys/a/secret', headers: { authorization: 'Bearer admin_token' } });
    const audit = await app.inject({ method: 'GET', url: '/_proxy/audit', headers: { authorization: 'Bearer admin_token' } });

    expect(revealed.statusCode).toBe(200);
    expect(revealed.json()).toMatchObject({ ok: true, id: 'a', secret: 'secret-key-a' });
    expect(revealed.body).not.toContain('"value"');
    expect(audit.json().audit.some((item: any) => item.action === 'reveal_key_secret' && item.targetId === 'a')).toBe(true);
  });

  it('disables and enables keys', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);
    const headers = { authorization: 'Bearer admin_token' };

    expect((await app.inject({ method: 'POST', url: '/_proxy/keys/a/disable', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/_proxy/keys/a/enable', headers })).statusCode).toBe(200);
  });

  it('tests a selected upstream key without leaking the raw key', async () => {
    let upstreamKey = '';
    const fake = await createFakeExa((request) => {
      upstreamKey = request.headers['x-api-key'] ?? '';
      return { status: 200, body: { results: [{ id: 'ok' }] } };
    });
    apps.push(fake.app);
    const app = await buildApp({
      config: testConfig({
        upstreamUrl: fake.url,
        keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }]
      })
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/_proxy/keys/a/test',
      headers: { authorization: 'Bearer admin_token' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, id: 'a', status: 200 });
    expect(upstreamKey).toBe('secret-key-a');
    expect(response.body).not.toContain('secret-key-a');
  });


  it('creates expiring admin sessions, rate-limits failed logins, and records audit entries', async () => {
    const app = await buildApp({ config: testConfig({ adminLockoutMaxFailures: 2, adminLockoutWindowSeconds: 60, adminLockoutSeconds: 60 }) });
    apps.push(app);

    expect((await app.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer admin_token' } })).statusCode).toBe(423);

    const cleanApp = await buildApp({ config: testConfig() });
    apps.push(cleanApp);
    const login = await cleanApp.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer admin_token' } });
    const session = login.json();
    const health = await cleanApp.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': session.sessionId } });
    const audit = await cleanApp.inject({ method: 'GET', url: '/_proxy/audit', headers: { 'x-admin-session-id': session.sessionId } });

    expect(login.statusCode).toBe(200);
    expect(session.sessionId).toBeTruthy();
    expect(session.tokenId).toMatch(/^tok_/);
    expect(health.statusCode).toBe(200);
    expect(audit.json().audit.some((item: any) => item.action === 'login' && item.success === true)).toBe(true);
  });

  it('persists admin sessions across app restarts and revokes them on logout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exa-admin-session-'));
    const dbPath = join(dir, 'state.sqlite');
    const localApps: Array<{ close(): Promise<void> }> = [];

    try {
      const firstApp = await buildApp({ config: testConfig({ statePath: dbPath }) });
      localApps.push(firstApp);
      const login = await firstApp.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer admin_token' } });
      const sessionId = login.json().sessionId;
      await localApps.pop()!.close();

      const restartedApp = await buildApp({ config: testConfig({ statePath: dbPath }) });
      localApps.push(restartedApp);
      const persisted = await restartedApp.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': sessionId } });
      const logout = await restartedApp.inject({ method: 'DELETE', url: '/_proxy/session', headers: { 'x-admin-session-id': sessionId } });
      await localApps.pop()!.close();

      const revokedApp = await buildApp({ config: testConfig({ statePath: dbPath }) });
      localApps.push(revokedApp);
      const revoked = await revokedApp.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': sessionId } });

      expect(login.statusCode).toBe(200);
      expect(sessionId).toEqual(expect.any(String));
      expect(persisted.statusCode).toBe(200);
      expect(logout.statusCode).toBe(200);
      expect(revoked.statusCode).toBe(401);
    } finally {
      while (localApps.length > 0) await localApps.pop()!.close().catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects expired admin sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T00:00:00Z'));
    const app = await buildApp({ config: testConfig({ adminSessionTtlSeconds: 1 }) });
    apps.push(app);

    const login = await app.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer admin_token' } });
    const session = login.json();
    const during = await app.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': session.sessionId } });

    await vi.advanceTimersByTimeAsync(1500);
    const expired = await app.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': session.sessionId } });

    expect(login.statusCode).toBe(200);
    expect(during.statusCode).toBe(200);
    expect(expired.statusCode).toBe(401);
  });

  it('enforces HTTPS for admin APIs when configured', async () => {
    const app = await buildApp({ config: testConfig({ adminRequireHttps: true }) });
    apps.push(app);

    const plainLogin = await app.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer admin_token' } });
    const httpsLogin = await app.inject({ method: 'POST', url: '/_proxy/session', headers: { authorization: 'Bearer admin_token', 'x-forwarded-proto': 'https' } });
    const session = httpsLogin.json();
    const plainHealth = await app.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': session.sessionId } });
    const httpsHealth = await app.inject({ method: 'GET', url: '/_proxy/health', headers: { 'x-admin-session-id': session.sessionId, 'x-forwarded-proto': 'https' } });

    expect(plainLogin.statusCode).toBe(426);
    expect(httpsLogin.statusCode).toBe(200);
    expect(plainHealth.statusCode).toBe(426);
    expect(httpsHealth.statusCode).toBe(200);
  });

  it('reports observability alerts and supports filtered CSV log export', async () => {
    const app = await buildApp({ config: testConfig({ alertAvailableKeyMin: 3, alertFailureRatePercent: 1, alertRateLimitRatePercent: 1 }) });
    apps.push(app);
    const proxyHeaders = { authorization: 'Bearer client_token', 'content-type': 'application/json' };
    const adminHeaders = { authorization: 'Bearer admin_token' };

    await app.inject({ method: 'GET', url: '/blocked', headers: proxyHeaders });
    await app.inject({ method: 'GET', url: '/search', headers: { authorization: 'Bearer bad' } });
    const logs = await app.inject({ method: 'GET', url: '/_proxy/logs?status=4xx&path=blocked', headers: adminHeaders });
    const exportResponse = await app.inject({ method: 'GET', url: '/_proxy/logs/export?status=4xx', headers: adminHeaders });
    const observability = await app.inject({ method: 'GET', url: '/_proxy/observability', headers: adminHeaders });

    expect(logs.statusCode).toBe(200);
    expect(logs.json().logs.every((log: any) => log.status >= 400 && log.status < 500 && log.path.includes('blocked'))).toBe(true);
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.body).toContain('createdAt,requestId,method,path,query,status');
    expect(observability.statusCode).toBe(200);
    expect(observability.json().trends.length).toBeGreaterThan(0);
    expect(observability.json().alerts.some((alert: any) => alert.id === 'available_keys_low')).toBe(true);
    expect(observability.json().retention).toMatchObject({
      days: 14,
      totalLogs: expect.any(Number),
      retainedLogs: expect.any(Number),
      expiredLogs: expect.any(Number),
      cutoffMs: expect.any(Number)
    });
    expect(observability.json().webhook).toMatchObject({ enabled: false });
  });

  it('exposes request traces, per-key failure summaries, and audit export', async () => {
    const fake = await createFakeExa((request) => {
      if (request.headers['x-api-key'] === 'key-a') return { status: 503, body: { error: 'temporary failure' } };
      return { status: 200, body: { results: [{ id: 'ok' }] } };
    });
    apps.push(fake.app);
    const app = await buildApp({
      config: testConfig({
        upstreamUrl: fake.url,
        keys: [
          { id: 'a', value: 'key-a', weight: 1, enabled: true },
          { id: 'b', value: 'key-b', weight: 1, enabled: true }
        ]
      })
    });
    apps.push(app);
    const headers = { authorization: 'Bearer admin_token', 'x-request-id': 'req_trace_admin' };

    await app.inject({ method: 'POST', url: '/_proxy/keys/a/test', headers });
    await app.inject({ method: 'POST', url: '/_proxy/keys/b/test', headers });
    const trace = await app.inject({ method: 'GET', url: '/_proxy/logs/trace/req_trace_admin', headers });
    const failures = await app.inject({ method: 'GET', url: '/_proxy/keys/a/failures', headers });
    const auditExport = await app.inject({ method: 'GET', url: '/_proxy/audit/export?action=test_key&success=false', headers });

    expect(trace.statusCode).toBe(200);
    expect(trace.json()).toMatchObject({ requestId: 'req_trace_admin', trace: expect.any(Array) });
    expect(trace.json().trace.map((log: any) => log.status)).toEqual([503, 200]);
    expect(failures.statusCode).toBe(200);
    expect(failures.json().summary).toMatchObject({ keyId: 'a', totalFailures: 1, reasons: { transient_status: 1 } });
    expect(auditExport.statusCode).toBe(200);
    expect(auditExport.headers['content-type']).toContain('text/csv');
    expect(auditExport.body).toContain('createdAt,actorTokenId,action,targetId,success,detail,ip,userAgent');
    expect(auditExport.body).toContain('test_key');
    expect(auditExport.body).not.toContain('key-a');
  });

  it('returns a sanitized runtime config summary for the console', async () => {
    const app = await buildApp({
      config: testConfig({
        host: '127.0.0.1',
        port: 8787,
        upstreamUrl: 'https://api.exa.ai',
        selectionStrategy: 'least_recently_used',
        allowedPaths: ['/search', '/contents'],
        adminRequireHttps: true,
        allowRawKeyDisplay: true,
        alertWebhookUrl: 'https://ops.example.test/hook?token=secret',
        alertWebhookBearerToken: 'webhook-token',
        keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }]
      } as any)
    });
    apps.push(app);

    const denied = await app.inject({ method: 'GET', url: '/_proxy/config-summary' });
    const response = await app.inject({
      method: 'GET',
      url: '/_proxy/config-summary',
      headers: { authorization: 'Bearer admin_token', 'x-forwarded-proto': 'https' }
    });

    expect(denied.statusCode).toBe(426);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      listen: '127.0.0.1:8787',
      upstream: 'https://api.exa.ai',
      selectionStrategy: 'least_recently_used',
      allowedPaths: { count: 2, preview: ['/search', '/contents'] },
      resourceAffinity: true,
      logRetentionDays: 14,
      adminRequireHttps: true,
      rawKeyDisplayAllowed: true,
      webhook: { enabled: true, target: 'https://ops.example.test/hook' }
    });
    expect(response.body).not.toContain('secret-key-a');
    expect(response.body).not.toContain('admin_token');
    expect(response.body).not.toContain('webhook-token');
    expect(response.body).not.toContain('token=secret');
  });

  it('renders broader Prometheus metrics without leaking raw keys', async () => {
    const app = await buildApp({
      config: testConfig({
        alertAvailableKeyMin: 3,
        keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }]
      })
    });
    apps.push(app);

    await app.inject({ method: 'GET', url: '/search', headers: { authorization: 'Bearer bad' } });
    const response = await app.inject({ method: 'GET', url: '/_proxy/metrics', headers: { authorization: 'Bearer admin_token' } });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('# HELP exa_proxy_requests_total');
    expect(response.body).toContain('exa_proxy_key_success_total{key_id="a"}');
    expect(response.body).toContain('exa_proxy_keys_healthy ');
    expect(response.body).toContain('exa_proxy_alerts_active ');
    expect(response.body).toContain('exa_proxy_log_retention_days 14');
    expect(response.body).toContain('exa_proxy_request_logs_total ');
    expect(response.body).toContain('exa_proxy_request_status_group_total{status_group="4xx"}');
    expect(response.body).toContain('exa_proxy_request_latency_p95_ms ');
    expect(response.body).toContain('exa_proxy_retries_total ');
    expect(response.body).toContain('exa_proxy_upstream_error_total{reason="unauthorized"}');
    expect(response.body).not.toContain('secret-key-a');
  });

  it('exports retry, upstream-error, and cooldown-reason metrics with low-cardinality labels', async () => {
    const app = await buildApp({
      config: testConfig({
        failureThreshold: 1,
        keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }]
      })
    });
    apps.push(app);

    await app.inject({
      method: 'POST',
      url: '/search',
      headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' },
      payload: { query: 'metrics failure path', numResults: 1 }
    });
    const response = await app.inject({ method: 'GET', url: '/_proxy/metrics', headers: { authorization: 'Bearer admin_token' } });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('exa_proxy_request_status_group_total{status_group="5xx"}');
    expect(response.body).toContain('exa_proxy_upstream_error_total{reason="connection_error"}');
    expect(response.body).toContain('exa_proxy_cooldown_reason_total{reason="connection_error"}');
    expect(response.body).not.toContain('/search');
    expect(response.body).not.toContain('secret-key-a');
  });

  it('dispatches configured alert webhooks with sanitized alert payloads, retry metadata, and signatures', async () => {
    const deliveries: any[] = [];
    const receiver = await createFakeExa((request) => {
      deliveries.push(request);
      return { status: deliveries.length === 1 ? 500 : 204, body: '' };
    });
    apps.push(receiver.app);
    const app = await buildApp({
      config: testConfig({
        alertAvailableKeyMin: 3,
        alertWebhookUrl: receiver.url,
        alertWebhookBearerToken: 'webhook-token',
        alertWebhookHmacSecret: 'signing-secret',
        alertWebhookCooldownSeconds: 60,
        alertWebhookMaxAttempts: 2,
        alertWebhookRetryBackoffMs: 1,
        keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }]
      } as any)
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/_proxy/observability', headers: { authorization: 'Bearer admin_token' } });
    const observability = response.json();

    expect(response.statusCode).toBe(200);
    expect(observability.webhook).toMatchObject({ enabled: true, lastStatus: 'sent', lastStatusCode: 204, lastAttempts: 2, signed: true });
    expect(deliveries).toHaveLength(2);
    expect(deliveries[0].headers.authorization).toBe('Bearer webhook-token');
    expect(deliveries[1].headers['x-exa-alert-signature']).toMatch(/^sha256=/);
    expect(deliveries[1].body.alerts.some((alert: any) => alert.id === 'available_keys_low')).toBe(true);
    expect(JSON.stringify(deliveries[1].body)).not.toContain('secret-key-a');
  });

  it('can send an explicit test alert webhook from the admin console', async () => {
    const deliveries: any[] = [];
    const receiver = await createFakeExa((request) => {
      deliveries.push(request);
      return { status: 204, body: '' };
    });
    apps.push(receiver.app);
    const app = await buildApp({
      config: testConfig({
        alertWebhookUrl: receiver.url,
        alertWebhookHmacSecret: 'signing-secret'
      } as any)
    });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: '/_proxy/alerts/webhook/test', headers: { authorization: 'Bearer admin_token' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, statusCode: 204, attempts: 1 });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].headers['x-exa-alert-signature']).toMatch(/^sha256=/);
    expect(deliveries[0].body.alerts[0]).toMatchObject({ id: 'webhook_test', severity: 'info' });
  });


  it('filters logs by key id, honors trend windows, and audits retention pruning', async () => {
    const app = await buildApp({ config: testConfig({ alertAvailableKeyMin: 0 }) });
    apps.push(app);
    const proxyHeaders = { authorization: 'Bearer client_token', 'content-type': 'application/json' };
    const adminHeaders = { authorization: 'Bearer admin_token', 'content-type': 'application/json' };

    await app.inject({ method: 'GET', url: '/search?first=1', headers: proxyHeaders });
    await app.inject({ method: 'GET', url: '/search?second=1', headers: proxyHeaders });

    const byKey = await app.inject({ method: 'GET', url: '/_proxy/logs?keyId=a&limit=20', headers: adminHeaders });
    const oneHour = await app.inject({ method: 'GET', url: '/_proxy/observability?hours=1', headers: adminHeaders });
    const sevenDays = await app.inject({ method: 'GET', url: '/_proxy/observability?hours=168', headers: adminHeaders });
    const pruned = await app.inject({ method: 'POST', url: '/_proxy/logs/prune', headers: adminHeaders, payload: { olderThanMs: Date.now() + 1000 } });
    const audit = await app.inject({ method: 'GET', url: '/_proxy/audit', headers: adminHeaders });

    expect(byKey.statusCode).toBe(200);
    expect(byKey.json().logs.length).toBeGreaterThan(0);
    expect(byKey.json().logs.every((log: any) => log.keyIds.includes('a'))).toBe(true);
    expect(oneHour.json().window.hours).toBe(1);
    expect(sevenDays.json().window.hours).toBe(168);
    expect(sevenDays.json().trends.length).toBeGreaterThan(oneHour.json().trends.length);
    expect(pruned.statusCode).toBe(200);
    expect(pruned.json().deleted).toBeGreaterThan(0);
    expect(audit.json().audit.some((item: any) => item.action === 'prune_logs')).toBe(true);
  });

  it('supports batch key operations and keeps audit records', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);
    const headers = { authorization: 'Bearer admin_token', 'content-type': 'application/json' };

    const batch = await app.inject({ method: 'POST', url: '/_proxy/keys/batch', headers, payload: { ids: ['a', 'b'], action: 'disable' } });
    const keys = await app.inject({ method: 'GET', url: '/_proxy/keys', headers });
    const audit = await app.inject({ method: 'GET', url: '/_proxy/audit', headers });

    expect(batch.statusCode).toBe(200);
    expect(batch.json().results).toHaveLength(2);
    expect(keys.json().keys.every((key: any) => key.enabled === false)).toBe(true);
    expect(audit.json().audit.some((item: any) => item.action === 'batch_disable')).toBe(true);
  });

  it('keeps the admin event stream open for live console refresh', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('test server failed to listen');

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/_proxy/events`, {
      headers: { authorization: 'Bearer admin_token' },
      signal: controller.signal
    });
    const reader = response.body!.getReader();
    const first = await reader.read();
    const firstText = new TextDecoder().decode(first.value);
    const next = await Promise.race([
      reader.read().then((result) => result.done ? 'closed' : 'chunk'),
      new Promise((resolve) => setTimeout(() => resolve('open'), 80))
    ]);

    controller.abort();
    await reader.cancel().catch(() => {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(first.done).toBe(false);
    expect(firstText).toContain('event: snapshot');
    expect(next).toBe('open');
  });

  it('streams admin console update events with admin authentication', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);

    const denied = await app.inject({ method: 'GET', url: '/_proxy/events' });
    const allowed = await app.inject({ method: 'GET', url: '/_proxy/events?once=true', headers: { authorization: 'Bearer admin_token' } });

    expect(denied.statusCode).toBe(401);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['content-type']).toContain('text/event-stream');
    expect(allowed.body).toContain('event: snapshot');
    expect(allowed.body).toContain('"keyCount"');
    expect(allowed.body).toContain('"logCount"');
  });

  it('serves a built-in admin web UI', async () => {
    const app = await buildApp({ config: testConfig() });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/_proxy/ui' });
    const rootResponse = await app.inject({ method: 'GET', url: '/' });
    const cssSource = readFileSync('src/admin-ui/admin.css', 'utf8');
    const jsSource = [
      'src/admin-ui/admin.js',
      'src/admin-ui/api.js',
      'src/admin-ui/state.js',
      'src/admin-ui/renderKeys.js',
      'src/admin-ui/renderLogs.js',
      'src/admin-ui/renderObservability.js'
    ].filter(existsSync).map((path) => readFileSync(path, 'utf8')).join('\n');
    const uiBundle = `${response.body}\n${cssSource}\n${jsSource}`;

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(rootResponse.statusCode).toBe(200);
    expect(rootResponse.headers['content-type']).toContain('text/html');
    expect(rootResponse.body).toContain('Exa 代理控制台');
    expect(uiBundle).toContain('Exa 代理控制台');
    expect(uiBundle).toContain('data-login-screen');
    expect(uiBundle).toContain('管理员令牌');
    expect(uiBundle).toContain('EXA_ADMIN_TOKENS');
    expect(uiBundle).toContain('不是 Exa API Key');
    expect(uiBundle).toContain('进入运维控制台');
    expect(uiBundle).toContain('会话只保存在当前浏览器环境');
    expect(uiBundle).toContain('运维访问令牌');
    expect(uiBundle).toContain('Admin Access Boundary');
    expect(uiBundle).toContain('class="auth-boundary" aria-label="访问边界。确认令牌仅用于本控制台，不会转发给上游 Exa"');
    expect(uiBundle).toContain('class="auth-trust-strip" aria-label="访问安全信号：服务端校验、本地状态、上游隔离。可据此确认入口安全边界"');
    expect(uiBundle).toContain('id="toggleSecretDisplay" class="ghost-btn secret-toggle" type="button" aria-label="密钥显示方式：原文。点击切换为脱敏显示" aria-pressed="true"');
    expect(uiBundle).toContain('action-group security-group" aria-label="密钥与会话。可切换密钥显示或退出登录"');
    expect(uiBundle).toContain('action-group refresh-group" aria-label="刷新设置。可开关自动刷新、改间隔或查看同步状态"');
    expect(uiBundle).toContain('action-group utility-group" aria-label="全局操作。可打开命令面板、测试 Webhook 或立即刷新"');
    expect(uiBundle).toContain('class="summary-strip" aria-label="服务摘要。可点击指标跳转密钥池或请求日志"');
    expect(uiBundle).toContain('class="insight-band" aria-label="运行洞察。可阅读判断并点击执行下一步"');
    expect(uiBundle).toContain('class="metrics metrics-compact" aria-label="控制台总览。可点击指标卡片打开日志或筛选异常"');
    expect(uiBundle).toContain('访问凭证');
    expect(uiBundle).toContain('上游隔离');
    expect(uiBundle).toContain('不转发给 Exa');
    expect(uiBundle).toContain('auth-card-brand');
    expect(uiBundle).not.toContain('class="auth-capabilities" aria-label="控制台能力摘要"');
    expect(uiBundle).not.toContain('auth-capability');
    expect(uiBundle).toContain('auth-access-note');
    expect(uiBundle).toContain('auth-demo-guide');
    expect(uiBundle).toContain('本地演示');
    expect(uiBundle).toContain('生产入口');
    expect(uiBundle).toContain('admin_local_token');
    expect(uiBundle).toContain('服务端校验');
    expect(uiBundle).toContain('代理边界');
    expect(uiBundle).toContain('id="fillDemoToken" class="demo-token-btn" type="button" aria-label="填入本地演示管理员令牌。填入后点击进入控制台" aria-describedby="authHintStatus"');
    expect(uiBundle).toContain('该按钮不会跳过后端校验');
    expect(uiBundle).toContain("loginToken.value = 'admin_local_token'");
    expect(uiBundle).toContain("el('loginButton').focus()");
    expect(uiBundle).toContain('id="loginCapsHint" class="login-caps-hint" role="status" aria-live="polite" aria-atomic="true" hidden');
    expect(uiBundle).toContain('id="authHintStatus" class="auth-hint-status" role="status" aria-live="polite" aria-atomic="true" aria-label="登录提示：该按钮不会跳过后端校验。可先填入 demo 令牌"');
    expect(uiBundle).toContain('令牌可见性：已隐藏。点击切换为显示');
    expect(uiBundle).toContain('正在登录控制台。请稍候');
    expect(uiBundle).toContain("function syncAutoRefreshAria");
    expect(uiBundle).toContain("const busyLabel = String(pendingText || '正在处理') + '。请稍候'");
    expect(uiBundle).toContain('Caps Lock 已开启');
    expect(uiBundle).toContain('请确认令牌大小写后继续输入或登录');
    expect(uiBundle).toContain('function syncLoginCapsHint');
    expect(uiBundle).toContain("event?.getModifierState?.('CapsLock')");
    expect(uiBundle).toContain("loginToken.addEventListener('keydown', syncLoginCapsHint)");
    expect(uiBundle).toContain("loginToken.addEventListener('keyup', syncLoginCapsHint)");
    expect(uiBundle).toContain('.auth-screen {');
    expect(uiBundle).toContain('.auth-boundary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(uiBundle).toContain('.auth-trust-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(uiBundle).toContain('.login-caps-hint {');
    expect(uiBundle).not.toContain('.auth-capabilities {');
    expect(uiBundle).toContain('place-items: center;');
    expect(uiBundle).not.toContain('place-items: center end');
    expect(uiBundle).toContain('.login-head h1 { margin: 0; color: var(--text); font-size: 24px; line-height: 1.14; font-weight: 720; letter-spacing: 0; }');
    expect(uiBundle).not.toContain('已加密');
    expect(uiBundle).not.toContain('登录前仪表盘');
    expect(uiBundle).not.toContain('auth-dashboard');
    expect(uiBundle).not.toContain('auth-log-table');
    expect(uiBundle).not.toContain('auth-brand');
    expect(uiBundle).not.toContain('Exa API 反向代理</h1>');
    expect(uiBundle).not.toContain('欢迎回来');
    expect(uiBundle).toContain('id="loginToken"');
    expect(uiBundle).toContain('id="loginError" class="login-error" role="status" aria-live="polite" aria-atomic="true" hidden');
    expect(uiBundle).toContain('function setLoginError');
    expect(uiBundle).toContain("errorEl.setAttribute('role', 'alert')");
    expect(uiBundle).toContain("errorEl.setAttribute('aria-live', 'assertive')");
    expect(uiBundle).toContain("loginToken.setAttribute('aria-invalid', 'true')");
    expect(uiBundle).toContain("setLoginError('请输入管理员令牌后再进入控制台。本地演示可点「填入 demo 令牌」。')");
    expect(uiBundle).toContain('id="loginButton" class="login-submit" type="submit" aria-label="使用管理员令牌进入控制台。可先填入 demo 令牌或直接提交"');
    expect(uiBundle).toContain('auth-key-icon');
    expect(uiBundle).toContain('login-submit-icon');
    expect(uiBundle).toContain('.login-submit-icon::before');
    expect(uiBundle).toContain('nav-icon-collapse');
    expect(uiBundle).toContain("collapseIcon.classList.toggle('is-collapsed', isCollapsed)");
    expect(uiBundle).toContain('function syncSidebarCollapseControl');
    for (const glyph of ['◇', '↪', '◈', '◐', '▤', '◉', '◁', '▷']) expect(uiBundle).not.toContain(glyph);
    expect(uiBundle).toContain('showLogin');
    expect(uiBundle).toContain('showConsole');
    expect(uiBundle).toContain('/_proxy/health');
    expect(uiBundle).toContain('/_proxy/events');
    expect(uiBundle).not.toContain('once=true');
    expect(uiBundle).toContain('EventSource');
    expect(uiBundle).toContain('refreshInFlight');
    expect(uiBundle).toContain('const refreshStatusCopy');
    expect(uiBundle).toContain('const liveLinkCopy');
    expect(uiBundle).toContain('function refreshTimeLabel');
    expect(uiBundle).toContain('function setRefreshStatus');
    expect(uiBundle).toContain('id="lastUpdated" class="refresh-status is-waiting" data-refresh-state="waiting" role="status"');
    expect(uiBundle).toContain('aria-label="控制台同步：待首次同步。可点击刷新状态开始同步"');
    expect(uiBundle).toContain("target.setAttribute('aria-label', refreshStatusAria.updated + ' ' + timeLabel + '。可继续观察，或再次点击刷新状态')");
    expect(uiBundle).toContain('控制台同步：正在同步密钥与观测数据。请稍候');
    expect(uiBundle).toContain('控制台同步：同步失败。可点击立即重试或检查网络后继续');
    expect(uiBundle).toContain('function setLiveLinkStatus');
    expect(uiBundle).toContain('function forceSessionExpired');
    expect(uiBundle).toContain('function isSessionExpiredError');
    expect(uiBundle).toContain("setRefreshStatus('syncing')");
    expect(uiBundle).toContain("setRefreshStatus('updated')");
    expect(uiBundle).toContain("setRefreshStatus('failed', '可点刷新重试')");
    expect(uiBundle).toContain('function setRefreshRecovery');
    expect(uiBundle).toContain("aria-describedby', 'refreshRecoveryText'");
    expect(uiBundle).toContain('立即重试控制台刷新，重新同步密钥与观测数据');
    expect(uiBundle).toContain('可点击立即重试，或检查服务与网络后继续');
    expect(uiBundle).toContain('控制台刷新失败恢复区');
    expect(uiBundle).toContain('id="refreshRecovery" class="refresh-recovery" hidden role="status" aria-live="polite" aria-atomic="true"');
    expect(uiBundle).toContain('id="retryRefresh" class="primary-btn refresh-recovery-retry" type="button" aria-label="立即重试控制台刷新，重新同步密钥与观测数据"');
    expect(uiBundle).toContain("el('retryRefresh')");
    expect(uiBundle).toContain('.refresh-recovery');
    expect(uiBundle).toContain('#retryRefresh.refresh-recovery-retry');
    expect(uiBundle).toContain('refresh recovery retry must beat generic .primary-btn 36px rule');
    expect(uiBundle).toContain('id="liveLinkStatus" class="live-link-status is-offline" data-live-state="offline" role="status"');
    expect(uiBundle).toContain('aria-label="实时链路：已断开。可点击刷新状态重新同步"');
    expect(uiBundle).toContain('.live-link-status');
    expect(uiBundle).toContain('.live-link-status.is-live');
    expect(uiBundle).toContain('.live-link-status.is-reconnecting');
    expect(uiBundle).toContain("setLiveLinkStatus('live')");
    expect(uiBundle).toContain("setLiveLinkStatus('reconnecting')");
    expect(uiBundle).toContain("setLiveLinkStatus('offline')");
    expect(uiBundle).toContain("target.setAttribute('aria-label', liveLinkAria[safeStatus] || liveLinkAria.offline)");
    expect(uiBundle).toContain('实时链路：已连接，变更会自动推送。可继续观察控制台');
    expect(uiBundle).toContain('实时链路：连接中断，正在重连。可稍候或手动刷新控制台');
    expect(uiBundle).toContain('实时链路：已断开。可点击刷新状态重新同步');
    expect(uiBundle).toContain('source.onopen');
    expect(uiBundle).toContain('登录已过期。请重新输入管理员令牌以继续运维操作。');
    expect(uiBundle).toContain('管理员令牌无效。请核对 EXA_ADMIN_TOKENS 配置，或本地演示令牌后重试。');
    expect(uiBundle).toContain('登录失败次数过多，账号已短暂锁定。请稍后再试，并核对管理员令牌。');
    expect(uiBundle).toContain('response.status === 401');
    expect(uiBundle).toContain("setRefreshStatus('waiting')");
    expect(uiBundle).toContain('data-refresh-state');
    expect(uiBundle).toContain('正在同步');
    expect(uiBundle).toContain('同步失败');
    expect(uiBundle).toContain('待同步');
    expect(uiBundle).toContain('实时在线');
    expect(uiBundle).toContain('正在重连');
    expect(uiBundle).toContain('实时离线');
    expect(uiBundle).toContain("button.setAttribute('aria-busy', 'true')");
    expect(uiBundle).toContain("target.setAttribute('aria-busy', 'true')");
    expect(uiBundle).toContain('aria-pressed=');
    expect(uiBundle).not.toContain('请输入管理员密钥');
    expect(uiBundle).not.toContain('请输入邮箱');
    expect(uiBundle).not.toContain('邮箱');
    expect(uiBundle).toContain('服务状态');
    expect(uiBundle).toContain('概览');
    expect(uiBundle).toContain('审计与配置');
    expect(uiBundle).toContain('治理摘要');
    expect(uiBundle).toContain('审计概览');
    expect(uiBundle).toContain('安全姿态');
    expect(uiBundle).toContain('日志治理');
    expect(uiBundle).toContain('id="launchReadiness"');
    expect(uiBundle).toContain('生产接入检查');
    expect(uiBundle).toContain('id="readinessChecks"');
    expect(uiBundle).toContain('id="readinessHttps"');
    expect(uiBundle).toContain('id="readinessRawKey"');
    expect(uiBundle).toContain('id="readinessState"');
    expect(uiBundle).toContain('id="readinessRetention"');
    expect(uiBundle).toContain('data-readiness-copy="live"');
    expect(uiBundle).toContain('data-readiness-copy="ready"');
    expect(uiBundle).toContain('data-readiness-copy="health"');
    expect(uiBundle).toContain('data-readiness-copy="proxy"');
    expect(uiBundle).toContain('curl http://127.0.0.1:8787/_proxy/live');
    expect(uiBundle).toContain('curl http://127.0.0.1:8787/_proxy/ready');
    expect(uiBundle).toContain('Authorization: Bearer &lt;管理员令牌&gt;');
    expect(uiBundle).toContain('Authorization: Bearer &lt;客户端令牌&gt;');
    expect(uiBundle).toContain('function setReadinessCheck');
    expect(uiBundle).toContain('function copyReadinessCommand');
    expect(uiBundle).toContain('navigator.clipboard?.writeText');
    expect(uiBundle).toContain('navigator.clipboard.writeText(command)');
    expect(uiBundle).toContain("showToast('命令已复制。可粘贴到终端执行，或返回上线检查继续核对。')");
    expect(uiBundle).toContain("showToast('命令复制失败，请手动选中命令文本复制。', 'bad')");
    expect(uiBundle).toContain("el('launchReadiness').addEventListener('click'");
    expect(uiBundle).toContain("event.target.closest('button[data-readiness-copy]')");
    expect(uiBundle).toContain('.launch-readiness-panel');
    expect(uiBundle).toContain('.readiness-command');
    expect(uiBundle).toContain('.readiness-copy-btn');
    expect(uiBundle).toContain('id="auditTotal"');
    expect(uiBundle).toContain('id="auditSuccess"');
    expect(uiBundle).toContain('id="auditFailure"');
    expect(uiBundle).toContain('id="auditEvidence"');
    expect(uiBundle).toContain('id="auditEvidenceTotal"');
    expect(uiBundle).toContain('id="auditEvidenceFailures"');
    expect(uiBundle).toContain('id="auditEvidenceActor"');
    expect(uiBundle).toContain('id="auditEvidenceExport"');
    expect(uiBundle).toContain('id="auditLatest" role="status" aria-live="polite" aria-atomic="true" aria-label="最新审计：暂无审计。可刷新列表等待新动作"');
    expect(uiBundle).toContain('id="auditEvidenceTotal" role="status" aria-live="polite" aria-atomic="true" aria-label="已载入证据：0。可刷新列表或到密钥池生成证据"');
    expect(uiBundle).toContain('function setAuditStatus');
    expect(uiBundle).toContain("setAuditStatus('auditTotal', fmt(total), '审计总记录', total ? '可搜索动作/密钥 ID 或导出证据' : '可刷新审计或到密钥池生成证据')");
    expect(uiBundle).toContain("setAuditStatus('auditSuccess', fmt(success), '审计成功', success ? '可按结果筛选成功记录' : '完成管理操作后会出现成功记录')");
    expect(uiBundle).toContain("setAuditStatus('auditFailure', fmt(failure), '审计失败', failure ? '可筛选失败记录并复核' : '当前无失败审计')");
    expect(uiBundle).toContain("setAuditStatus('auditLatest', latestText, '最新审计', latest ? '可按最新线索搜索审计' : '可刷新列表等待新动作')");
    expect(uiBundle).toContain("setAuditStatus('auditEvidenceFailures', failureText, '失败审计', failures ? failureAction : '当前无失败审计')");
    expect(uiBundle).toContain("setAuditStatus('auditEvidenceExport', exportText, '导出状态', exportAction)");
    expect(uiBundle).toContain("setAuditStatus('auditEvidenceTotal', totalText, '已载入证据', total ? resetAction : '可刷新列表或到密钥池生成证据')");
    expect(uiBundle).toContain("setAuditStatus('auditEvidenceActor', latestActor, '最新操作者', latestSearch ? latestActionHint : '完成管理操作后再试')");
    expect(uiBundle).toContain('aria-label="审计统计。可刷新审计或到密钥池生成证据"');
    expect(uiBundle).toContain('aria-label="安全配置摘要。可到配置详情复核 HTTPS、密钥与路径策略"');
    expect(uiBundle).toContain('aria-label="日志保留摘要。可到配置详情复核保留窗口与过期日志"');
    expect(uiBundle).toContain('aria-label="上线检查项。可到配置详情复核，或复制探针命令验证"');
    expect(uiBundle).toContain('aria-label="审计证据摘要。可筛选失败、按最新线索搜索或导出 CSV"');
    expect(uiBundle).toContain('id="auditCount" role="status" aria-live="polite" aria-atomic="true" aria-label="管理员审计：最近窗口 0 条。可刷新列表或到密钥池生成证据"');
    expect(uiBundle).toContain('id="auditPager" role="status" aria-live="polite" aria-atomic="true" aria-label="审计分页：显示 0 条审计。可刷新列表或到密钥池生成证据"');
    expect(uiBundle).toContain('id="readinessRawKeyValue" role="status" aria-live="polite" aria-atomic="true" aria-label="原始密钥：待同步。可继续观察，或到配置详情复核"');
    expect(uiBundle).toContain('id="governanceRawKey" role="status" aria-live="polite" aria-atomic="true" aria-label="原始密钥策略：待同步。可到配置详情查看并继续观察"');
    expect(uiBundle).toContain('id="governanceRetention" role="status" aria-live="polite" aria-atomic="true" aria-label="日志保留：待同步。可到配置详情查看并继续观察"');
    expect(uiBundle).toContain('data-audit-evidence-action="reset"');
    expect(uiBundle).toContain('data-audit-evidence-action="failures"');
    expect(uiBundle).toContain('data-audit-evidence-action="latest"');
    expect(uiBundle).toContain('data-audit-evidence-action="export"');
    expect(uiBundle).toContain('class="audit-evidence-label"');
    expect(uiBundle).toContain('id="auditSearch" class="search compact" placeholder="动作 / 操作者 / 详情" aria-label="按动作、操作者或详情搜索审计记录。输入后即时收窄证据"');
    expect(uiBundle).toContain('id="auditActionFilter" class="select" aria-label="按审计动作筛选。选择后即时收窄证据列表"');
    expect(uiBundle).toContain('id="auditOutcomeFilter" class="select" aria-label="按审计结果筛选。选择成功或失败后即时收窄"');
    expect(uiBundle).toContain('aria-label="复制存活探针命令。复制后可到终端验证"');
    expect(uiBundle).toContain('aria-label="复制可服务探针命令。复制后可到终端验证"');
    expect(uiBundle).toContain('data-detail-action="test" aria-label="测试密钥 ');
    expect(uiBundle).toContain('data-detail-action="logs" aria-label="查看密钥 ');
    expect(uiBundle).toContain('data-detail-action="copy" aria-label="复制密钥 ');
    expect(uiBundle).toContain('可在侧栏复核用量与操作');
    expect(uiBundle).toContain('可展开尝试顺序与密钥链');
    expect(uiBundle).toContain('id="auditFilterSummary" class="audit-filter-summary is-empty" role="status" aria-live="polite" aria-atomic="true" aria-label="审计筛选状态：最近 12 条审计 · 可按关键词/动作/结果收窄。可搜索动作/操作者或按结果筛选"');
    expect(uiBundle).toContain('id="auditFilterSummaryText"');
    expect(uiBundle).toContain('id="auditFilterChips" class="audit-filter-chips"');
    expect(uiBundle).toContain('id="clearAuditFilters" class="mini-btn" type="button" data-audit-filter-action="clear" aria-label="清除管理员审计筛选，恢复最近审计" hidden');
    expect(uiBundle).toContain('const AUDIT_LIST_WINDOW = 12');
    expect(uiBundle).toContain('id="auditCount"');
    expect(uiBundle).toContain('id="auditPagerHint" class="pager-hint"');
    expect(uiBundle).toContain('最近载入窗口 · 最多 12 条 · 非分页');
    expect(uiBundle).toContain("最近 ' + fmt(AUDIT_LIST_WINDOW) + ' 条审计 · 可按关键词/动作/结果收窄");
    expect(uiBundle).toContain('id="governanceHttps"');
    expect(uiBundle).toContain('id="governanceRawKey"');
    expect(uiBundle).toContain('id="governanceRetention"');
    expect(uiBundle).toContain('id="configEvidence"');
    expect(uiBundle).toContain('id="configEvidenceHttps"');
    expect(uiBundle).toContain('id="configEvidenceRawKey"');
    expect(uiBundle).toContain('id="configEvidencePaths"');
    expect(uiBundle).toContain('id="configEvidenceState"');
    expect(uiBundle).toContain('data-config-posture-action="https"');
    expect(uiBundle).toContain('data-config-posture-action="raw-key"');
    expect(uiBundle).toContain('data-config-posture-action="paths"');
    expect(uiBundle).toContain('data-config-posture-action="state"');
    expect(uiBundle).toContain('id="configDetailHttps" class="config-item" tabindex="-1" data-config-posture-target="https"');
    expect(uiBundle).toContain('id="configDetailRawKey" class="config-item" tabindex="-1" data-config-posture-target="raw-key"');
    expect(uiBundle).toContain('id="configDetailPaths" class="config-item" tabindex="-1" data-config-posture-target="paths"');
    expect(uiBundle).toContain('id="configDetailState" class="config-item" tabindex="-1" data-config-posture-target="state"');
    expect(uiBundle).toContain('function focusConfigPosture');
    expect(uiBundle).toContain("event.target.closest('button[data-config-posture-action]')");
    expect(uiBundle).toContain('.config-evidence-item:hover');
    expect(uiBundle).toContain('.config-item[data-config-focus="true"]');
    expect(uiBundle).toContain('.config-body { min-height: 0; flex: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 7px; padding: 10px 12px; overflow: auto; }');
    expect(uiBundle).toContain('.config-body > .config-item:has(#configUpstream)');
    expect(uiBundle).toContain('.config-body > #configDetailPaths { grid-column: 1 / -1; }');
    expect(uiBundle).toContain('grid-template-columns: repeat(auto-fit, minmax(136px, 1fr))');
    expect(uiBundle).toContain('.audit-evidence-item:hover:not(:disabled)');
    expect(uiBundle).toContain('.audit-evidence-item:disabled { cursor: not-allowed; opacity: .58; }');
    expect(uiBundle).toContain('.audit-evidence-item small, .config-evidence-item small { min-width: 0; color: var(--muted); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; white-space: normal; }');
    expect(uiBundle).toContain('data-mobile-tabs');
    expect(uiBundle).toContain('data-tab-nav');
    expect(uiBundle).toContain('document.querySelectorAll(\'[data-tab-nav]\')');
    expect(uiBundle).toContain('自动刷新');
    expect(uiBundle).toContain('id="autoRefresh" type="checkbox" checked aria-label="自动刷新：已开启。可取消以仅手动刷新控制台数据"');
    expect(uiBundle).toContain('近 24 小时');
    expect(uiBundle).toContain('全部');
    expect(uiBundle).toContain('id="keySearch" class="search" placeholder="搜索 ID 或备注" aria-label="按密钥 ID 或备注搜索密钥池。输入后即时收窄列表"');
    expect(uiBundle).toContain('id="keyCount" role="status" aria-live="polite" aria-atomic="true" aria-label="密钥池：0 个密钥。可批量导入密钥后开始调度"');
    expect(uiBundle).toContain("keyCountEl.setAttribute('aria-label', '密钥池：' + keyCountText + '。' + keyCountNext)");
    expect(uiBundle).toContain('id="logCount" role="status" aria-live="polite" aria-atomic="true" aria-label="请求日志：已载入 0 条"');
    expect(uiBundle).toContain("logCountEl.setAttribute('aria-label', '请求日志：' + logCountText + (filters.active ? '（筛选中）' : '') + '。' + logCountNext)");
    expect(uiBundle).toContain('id="auditCount" role="status" aria-live="polite" aria-atomic="true" aria-label="管理员审计：最近窗口 0 条。可刷新列表或到密钥池生成证据"');
    expect(uiBundle).toContain("countEl.setAttribute('aria-label', '管理员审计：' + auditCountText + (filters.active ? '（筛选中）' : '') + '。' + auditCountNext)");
    expect(uiBundle).toContain('id="keyPager" role="status" aria-live="polite" aria-atomic="true" aria-label="密钥分页：显示 0 个密钥"');
    expect(uiBundle).toContain("keyPagerEl.setAttribute('aria-label', '密钥分页：' + keyPagerText + '。' + pagerNext)");
    expect(uiBundle).toContain('id="keyPageLabel" role="status" aria-live="polite" aria-atomic="true" aria-label="密钥页码：第 1 页"');
    expect(uiBundle).toContain("keyPageLabelEl.setAttribute('aria-label', '密钥页码：' + keyPageLabelText + '。' + pageNext)");
    expect(uiBundle).toContain('id="alertCount" role="status" aria-live="polite" aria-atomic="true" aria-label="告警中心：0 条告警。可继续观察密钥池与请求日志"');
    expect(uiBundle).toContain("alertCountEl.setAttribute('aria-label', '告警中心：' + alertCountText + '。' + alertNext)");
    expect(uiBundle).toContain('data-summary-metric="service"');
    expect(uiBundle).toContain('data-summary-metric="active-keys"');
    expect(uiBundle).toContain('data-summary-metric="total-requests"');
    expect(uiBundle).toContain('data-summary-metric="error-rate"');
    expect(uiBundle).toContain("serviceBtn.setAttribute('aria-label', '服务状态：' + serviceText + '。点击打开密钥池复核调度')");
    expect(uiBundle).toContain("activeKeysBtn.setAttribute('aria-label', '启用密钥：' + fmt(totals.active) + '。点击打开密钥池管理启用项')");
    expect(uiBundle).toContain("totalRequestsBtn.setAttribute('aria-label', '请求总量：' + fmt(totals.requests) + '。点击打开请求日志复核流量')");
    expect(uiBundle).toContain("errorRateBtn.setAttribute('aria-label', '错误率：' + errorRate + '。点击筛选错误请求日志')");
    expect(uiBundle).toContain('data-metric-card="usage"');
    expect(uiBundle).toContain('data-metric-card="success"');
    expect(uiBundle).toContain('data-metric-card="rate-limit"');
    expect(uiBundle).toContain('data-metric-card="latency"');
    expect(uiBundle).toContain('data-metric-card="failure"');
    expect(uiBundle).toContain("usageCard.setAttribute('aria-label', '用量：' + usageText + '。点击查看近 24 小时请求日志')");
    expect(uiBundle).toContain("successCard.setAttribute('aria-label', '成功率：' + successText + '。点击查看成功请求日志')");
    expect(uiBundle).toContain("rateLimitCard.setAttribute('aria-label', '限流 429：' + rateLimitText + '。点击筛选 429 请求日志')");
    expect(uiBundle).toContain("latencyCard.setAttribute('aria-label', '平均延迟：' + latencyText + '。点击查看最近响应日志')");
    expect(uiBundle).toContain("failureCard.setAttribute('aria-label', '失败数：' + failureText + '。点击筛选失败请求日志')");
    expect(uiBundle).toContain("告警：' + esc(title) + '，级别 ' + esc(severity)");
    expect(uiBundle).toContain('点击聚焦建议，并优先到密钥池或请求日志复核');
    expect(uiBundle).toContain('id="trendWindowLabel" role="status" aria-live="polite" aria-atomic="true" aria-label="趋势窗口：近 24 小时。可切换观测窗口对比"');
    expect(uiBundle).toContain("trendWindowEl.setAttribute('aria-label', '趋势窗口：' + windowLabel + '。' + windowNext)");
    expect(uiBundle).toContain('id="logPager" role="status" aria-live="polite" aria-atomic="true" aria-label="日志分页：显示 0 条日志"');
    expect(uiBundle).toContain("logPagerEl.setAttribute('aria-label', '日志分页：' + logPagerText + (filters.active ? '（筛选中）' : '') + '。' + logPagerNext)");
    expect(uiBundle).toContain('id="auditPager" role="status" aria-live="polite" aria-atomic="true" aria-label="审计分页：显示 0 条审计。可刷新列表或到密钥池生成证据"');
    expect(uiBundle).toContain("pager.setAttribute('aria-label', '审计分页：' + auditPagerText + (filters.active ? '（筛选中）' : '') + '。' + auditPagerNext)");
    expect(uiBundle).toContain("summary.setAttribute('aria-label', '密钥筛选状态：' + summaryText + '。' + summaryNext)");
    expect(uiBundle).toContain("summary.setAttribute('aria-label', '请求日志筛选状态：' + summaryText + '。' + summaryNext)");
    expect(uiBundle).toContain("summary.setAttribute('aria-label', '审计筛选状态：' + summaryText + '。' + summaryNext)");
    expect(uiBundle).toContain('id="selectAllKeys" type="checkbox" class="key-checkbox" aria-label="选择当前页全部密钥。勾选后可使用批量操作栏"');
    expect(uiBundle).toContain("选择当前页全部密钥。勾选后可使用批量操作栏");
    expect(uiBundle).toContain("取消选择当前页全部密钥（已选 ' + fmt(selectedOnPage) + ' 个）。取消后可重新勾选");
    expect(uiBundle).toContain("点击选择当前页全部密钥后可批量操作");
    expect(uiBundle).toContain('id="batchBar" class="batch-bar" role="region" aria-label="已选密钥批量操作。操作会写入管理员审计" hidden');
    expect(uiBundle).toContain('id="batchCount" class="batch-count" role="status" aria-live="polite" aria-atomic="true"');
    expect(uiBundle).toContain('function syncSelectAllKeysControl');
    expect(uiBundle).toContain("selectAll.indeterminate = someSelected");
    expect(uiBundle).toContain("selectAll.setAttribute('aria-checked', someSelected ? 'mixed' : String(allSelected))");
    expect(uiBundle).toContain("countEl.setAttribute('aria-label', count ? (summary + '，' + hint + '。' + nextAction) : ('尚未选择密钥。' + nextAction))");
    expect(uiBundle).toContain("可测试/启用/禁用已选密钥，或清除选择");
    expect(uiBundle).toContain("可在密钥池勾选密钥后使用批量操作");
    expect(uiBundle).toContain('id="batchClearSelection" class="ghost-btn" type="button" aria-label="清除已选密钥。清除后可重新勾选"');
    expect(uiBundle).toContain('id="batchEnableSelected" class="ghost-btn" type="button" aria-label="启用已选密钥。结果会写入管理员审计"');
    expect(uiBundle).toContain('id="batchDisableSelected" class="ghost-btn" type="button" aria-label="禁用已选密钥。确认后会写入管理员审计"');
    expect(uiBundle).toContain('id="batchResetSelected" class="ghost-btn" type="button" aria-label="重置已选密钥冷却。可恢复调度后继续观察"');
    expect(uiBundle).toContain('id="batchTestSelected" class="primary-btn" type="button" aria-label="测试已选密钥。结果会写入审计并可在详情复核"');
    expect(uiBundle).toContain('function clearBatchSelection');
    expect(uiBundle).toContain('function updateBatchBar');
    expect(uiBundle).toContain("shell.setAttribute('data-batch-open', '')");
    expect(uiBundle).toContain("shell.removeAttribute('data-batch-open')");
    expect(uiBundle).toContain('--batch-bar-safe');
    expect(uiBundle).toContain('.console-shell[data-batch-open]');
    expect(uiBundle).toContain("el('batchClearSelection').addEventListener('click', clearBatchSelection)");
    expect(uiBundle).toContain('id="keyPageSize" class="select page-size-select" aria-label="每页密钥数量。调整后从第一页重新显示"');
    expect(uiBundle).toContain('id="jumpKeyPage" type="number" min="1" class="jump-input" aria-label="跳转到密钥页码。输入页码后按 Enter"');
    expect(uiBundle).toContain('<th>密钥 ID</th><th>启用</th><th>信号</th>');
    expect(uiBundle).toContain('待管理员登录');
    expect(uiBundle).toContain('key-empty-state idle');
    expect(uiBundle).toContain('class="sortable" data-sort="requests" aria-sort="none"');
    expect(uiBundle).toContain('class="sort-btn" type="button" data-sort="requests" data-sort-label="请求数" aria-label="按请求数排序。点击后按升序排列密钥表" aria-pressed="false"');
    expect(uiBundle).toContain('class="sort-indicator" aria-hidden="true"');
    expect(uiBundle).toContain('function keySortAriaLabel');
    expect(uiBundle).toContain("按' + label + '排序。点击后按升序排列密钥表");
    expect(uiBundle).toContain("再次点击切换为' + next");
    expect(uiBundle).toContain('function syncKeySortHeaders');
    expect(uiBundle).toContain("th.setAttribute('aria-sort', isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none')");
    expect(uiBundle).toContain("button.setAttribute('aria-pressed', String(isActive))");
    expect(uiBundle).toContain('function applyKeySort');
    expect(uiBundle).toContain("event.target.closest('.sort-btn[data-sort]')");
    expect(uiBundle).toContain('.sort-btn');
    expect(uiBundle).toContain('.sort-indicator::before');
    expect(uiBundle).toContain('function keyRowSignal');
    expect(uiBundle).toContain("label: '已停用'");
    expect(uiBundle).toContain("label: '冷却中'");
    expect(uiBundle).toContain("label: '429 压力'");
    expect(uiBundle).toContain("label: '超时压力'");
    expect(uiBundle).toContain("label: '失败信号'");
    expect(uiBundle).toContain("label: '待样本'");
    expect(uiBundle).toContain("label: '可调度'");
    expect(uiBundle).toContain("const signalAria = '密钥 ' + keyLabel + ' 状态信号：' + signal.label + '，' + signal.detail + '。' + signalNext;");
    expect(uiBundle).toContain("可启用后恢复调度");
    expect(uiBundle).toContain("可重置冷却后继续观察");
    expect(uiBundle).toContain("可打开详情复核调度状态");
    expect(uiBundle).toContain('class="key-signal-cell"');
    expect(uiBundle).toContain('class="key-row-signal \' + esc(signal.tone) + \'"');
    expect(uiBundle).toContain('.key-table-scroll table { min-width: 1080px; }');
    expect(uiBundle).toContain('.key-row-signal.good');
    expect(uiBundle).toContain('.key-row-signal.warn');
    expect(uiBundle).toContain('.key-row-signal.bad');
    expect(uiBundle).toContain('.key-row-signal.blue');
    expect(uiBundle).toContain('aria-label="选择密钥 ');
    expect(uiBundle).toContain('勾选后可批量操作');
    expect(uiBundle).toContain('aria-label="切换密钥 ');
    expect(uiBundle).toContain("当前' + (key.enabled ? '已启用，点击禁用' : '已禁用，点击启用')");
    expect(uiBundle).toContain('aria-label="查看密钥 ');
    expect(uiBundle).toContain('可在侧栏复核用量与操作');
    expect(uiBundle).toContain('aria-label="重置密钥 ');
    expect(uiBundle).toContain('可恢复调度后继续观察');
    expect(uiBundle).toContain('aria-label="测试密钥 ');
    expect(uiBundle).toContain('结果会写入审计并可在详情复核');
    expect(uiBundle).toContain('aria-label="测试当前页密钥。结果会写入审计并可在详情复核"');
    expect(uiBundle).toContain('测试当前页');
    expect(uiBundle).toContain('aria-label="禁用异常密钥。确认后会写入管理员审计"');
    expect(uiBundle).toContain('禁用异常密钥');
    expect(uiBundle).not.toContain('测试选中');
    expect(uiBundle).toContain('id="keyWorkflowSummary" class="key-workflow-summary" role="status" aria-live="polite" aria-atomic="false" aria-label="密钥池工作流摘要：可重置筛选、筛选异常、搜索收窄或勾选后批量操作"');
    expect(uiBundle).toContain('id="keyWorkflowVisible"');
    expect(uiBundle).toContain('id="keyWorkflowSelected"');
    expect(uiBundle).toContain('id="keyWorkflowProblems"');
    expect(uiBundle).toContain('id="keyWorkflowScope"');
    expect(uiBundle).toContain('data-key-workflow-action="reset"');
    expect(uiBundle).toContain('data-key-workflow-action="selected"');
    expect(uiBundle).toContain('data-key-workflow-action="problems"');
    expect(uiBundle).toContain('data-key-workflow-action="scope"');
    expect(uiBundle).toContain('class="key-workflow-label"');
    expect(uiBundle).toContain("密钥池工作流摘要：已选 ' + fmt(selectedCount) + ' 个。可批量操作、筛选异常或调整搜索");
    expect(uiBundle).toContain("点击聚焦批量操作栏，可测试/启用/禁用");
    expect(uiBundle).toContain('function syncKeyWorkflowAction');
    expect(uiBundle).toContain("syncKeyWorkflowAction('reset', false, '当前显示：' + visibleCountText + '，' + pageHintText + '。' + resetAction)");
    expect(uiBundle).toContain("syncKeyWorkflowAction('problems', problemCount === 0, '异常压力：' + fmt(problemCount) + '，' + problemHintText + '。' + problemAction)");
    expect(uiBundle).toContain("syncKeyWorkflowAction('scope', false, '筛选范围：' + scopeText + '，' + scopeHintText + '。' + scopeAction)");
    expect(uiBundle).toContain("已选择：' + fmt(selectedCount) + '。点击聚焦批量操作栏，可测试/启用/禁用");
    expect(uiBundle).toContain('function runKeyWorkflowAction');
    expect(uiBundle).toContain('function applyProblemKeyFilter');
    expect(uiBundle).toContain("el('keyWorkflowSummary').addEventListener('click'");
    expect(uiBundle).toContain('function renderKeyWorkflowSummary');
    expect(uiBundle).toContain('function keyScopeText');
    expect(uiBundle).toContain('id="keyFilterSummary" class="key-filter-summary is-empty"');
    expect(uiBundle).toContain('id="keyFilterSummaryText"');
    expect(uiBundle).toContain('id="keyFilterSummaryChips" class="key-filter-chips"');
    expect(uiBundle).toContain('id="keyFilterChips" class="filter-chips" role="group" aria-label="密钥状态筛选。点选状态后收窄密钥表"');
    expect(uiBundle).toContain('data-chip="All" aria-pressed="true"');
    expect(uiBundle).toContain('data-chip="Problem" aria-pressed="false"');
    expect(uiBundle).toContain("当前筛选：' + label + '，' + count + ' 个。可切换其他状态或清除筛选");
    expect(uiBundle).toContain("筛选' + label + '，' + count + ' 个。点击后收窄密钥表");
    expect(uiBundle).toContain("chipFilterLabels");
    expect(uiBundle).toContain('id="clearKeyFilters" class="mini-btn" type="button" data-key-filter-action="clear" aria-label="清除密钥池筛选，恢复全部密钥" hidden');
    expect(uiBundle).toContain('function keyFilterLabel');
    expect(uiBundle).toContain('function keyFilterState');
    expect(uiBundle).toContain('function renderKeyFilterSummary');
    expect(uiBundle).toContain('renderKeyFilterSummary({ rows, filter, query });');
    expect(uiBundle).toContain('全部密钥 · 可按关键词或状态收窄');
    expect(uiBundle).toContain("匹配 ' + fmt(rows.length) + ' 个密钥 · 批量作用于当前页");
    expect(uiBundle).toContain('key-filter-chip');
    expect(uiBundle).toContain('.key-filter-summary');
    expect(uiBundle).toContain('function clearKeyFilters');
    expect(uiBundle).toContain('function removeKeyFilterDimension');
    expect(uiBundle).toContain('function filterChipMarkup');
    expect(uiBundle).toContain('data-filter-remove=');
    expect(uiBundle).toContain("filterChipMarkup('key', item)");
    expect(uiBundle).toContain("state.keyFilter = 'All'");
    expect(uiBundle).toContain("el('clearKeyFilters').addEventListener('click', clearKeyFilters)");
    expect(uiBundle).toContain("el('keyFilterSummaryChips').addEventListener('click'");
    expect(uiBundle).toContain('export function updateKeyWorkflowSelection');
    expect(uiBundle).toContain('updateKeyWorkflowSelection();');
    expect(uiBundle).toContain('.key-workflow-summary');
    expect(uiBundle).toContain('.key-workflow-item.is-warn strong');
    expect(uiBundle).toContain('.key-workflow-item:hover:not(:disabled)');
    expect(uiBundle).toContain('.key-workflow-item:disabled');
    expect(uiBundle).toContain('.key-workflow-label em');
    expect(uiBundle).toContain('密钥详情');
    expect(uiBundle).toContain('移动端密钥详情');
    expect(uiBundle).toContain('detail-body-target');
    expect(uiBundle).toContain('function setDetailBodies');
    expect(uiBundle).toContain('function syncMobileDetailsPanel');
    expect(uiBundle).toContain('mobileDetailsOpen: false');
    expect(uiBundle).toContain('state.mobileDetailsOpen = false');
    expect(uiBundle).toContain("panel.classList.toggle('is-open', open)");
    expect(uiBundle).toContain('移动端密钥详情已打开。可复核用量与操作，或关闭返回密钥表');
    expect(uiBundle).toContain("['select', 'copy', 'reset', 'test', 'enable', 'disable', 'logs'].includes(action)");
    expect(uiBundle).toContain("document.querySelectorAll('.detail-body-target')");
    expect(uiBundle).toContain('function scrollMobileDetailsIntoView');
    expect(uiBundle).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
    expect(uiBundle).toContain("panel.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })");
    expect(uiBundle).toContain('function detailHealthFor');
    expect(uiBundle).toContain('detail-hero');
    expect(uiBundle).toContain('detail-health');
    expect(uiBundle).toContain('detail-facts');
    expect(uiBundle).toContain('detail-diagnostics');
    expect(uiBundle).toContain('detail-actions');
    expect(uiBundle).toContain('data-detail-action="logs"');
    expect(uiBundle).toContain('查看日志');
    expect(uiBundle).toContain('可继续调度');
    expect(uiBundle).toContain('批量操作会写入管理员审计');
    expect(uiBundle).toContain('countEl.innerHTML');
    expect(uiBundle).toContain('function renderKeyFilteredEmptyState');
    expect(uiBundle).toContain('function renderKeyFilteredDetailEmpty');
    expect(uiBundle).toContain('function renderKeyFirstRunDetailEmpty');
    expect(uiBundle).toContain('function renderKeyIdleDetailEmpty');
    expect(uiBundle).toContain('key-detail-empty first-run');
    expect(uiBundle).toContain('导入密钥后显示详情');
    expect(uiBundle).toContain('选择一个密钥查看详情');
    expect(uiBundle).toContain('data-empty-action="select-first-key"');
    expect(uiBundle).toContain('data-empty-action="focus-key-search"');
    expect(uiBundle).toContain('查看首个密钥');
    expect(uiBundle).toContain('也可直接查看当前页首个密钥，或用搜索缩小范围。');
    expect(uiBundle).toContain('key-empty-state filtered');
    expect(uiBundle).toContain('没有匹配的密钥');
    expect(uiBundle).toContain('data-empty-action="clear-filters"');
    expect(uiBundle).toContain('当前范围没有可查看密钥');
    expect(uiBundle).toContain('function runKeyEmptyAction');
    expect(uiBundle).toContain("action === 'clear-filters'");
    expect(uiBundle).toContain("action === 'select-first-key'");
    expect(uiBundle).toContain("action === 'focus-key-search'");
    expect(uiBundle).toContain('密钥池');
    expect(uiBundle).toContain('请求日志');
    expect(uiBundle).toContain('trace-empty-state idle');
    expect(uiBundle).toContain('log-empty-state');
    expect(uiBundle).toContain('log-empty-cell');
    expect(uiBundle).toContain('trace-empty-steps');
    expect(uiBundle).toContain('function renderLogEmptyState');
    expect(uiBundle).toContain('data-empty-action="refresh-logs"');
    expect(uiBundle).toContain('重新载入最近请求窗口');
    expect(uiBundle).toContain('可先刷新载入最近窗口，或从客户端发起一次探测请求。');
    expect(uiBundle).toContain("emptyAction.dataset.emptyAction === 'refresh-logs'");
    expect(uiBundle).toContain('待管理员登录');
    expect(uiBundle).toContain('key-empty-state idle');
    expect(uiBundle).toContain('log-empty-state empty');
    expect(uiBundle).toContain('audit-empty-state empty');
    expect(uiBundle).toContain('data-empty-action="clear-log-filters"');
    expect(uiBundle).toContain('data-empty-action="clear-audit-filters"');
    expect(uiBundle).toContain("emptyAction.dataset.emptyAction === 'clear-log-filters'");
    expect(uiBundle).toContain("emptyAction.dataset.emptyAction === 'clear-audit-filters'");
    expect(uiBundle).toContain('function logFilterState');
    expect(uiBundle).toContain('function renderLogFilterSummary');
    expect(uiBundle).toContain('function reloadLogs');
    expect(uiBundle).toContain('function applyLogKeyFilter');
    expect(uiBundle).toContain("el('logKeyFilter').value = keyId");
    expect(uiBundle).toContain("await applyLogKeyFilter(id, { focus: true, toast: '已按密钥筛选请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' })");
    expect(uiBundle).toContain('function clearLogFilters');
    expect(uiBundle).toContain('function removeLogFilterDimension');
    expect(uiBundle).toContain('id="logSearch" class="search compact" placeholder="关键词 / requestId" aria-label="按关键词或 requestId 搜索请求日志。输入后可点 requestId 看链路"');
    expect(uiBundle).toContain('id="logPathFilter" class="search compact" placeholder="路径如 /search" aria-label="按路径筛选请求日志。输入后会重新载入匹配请求"');
    expect(uiBundle).toContain('id="logKeyFilter" class="search compact" placeholder="密钥 ID" aria-label="按密钥 ID 筛选请求日志。输入后会重新载入匹配请求"');
    expect(uiBundle).toContain('id="logStatusFilter" class="select" aria-label="按状态筛选请求日志。选择后会重新载入匹配请求"');
    expect(uiBundle).toContain('id="logFilterSummary" class="log-filter-summary is-empty" role="status" aria-live="polite" aria-atomic="true" aria-label="请求日志筛选状态：最近请求日志 · 可按关键词/路径/密钥/状态收窄。可搜索 requestId 或按路径/状态筛选"');
    expect(uiBundle).toContain('id="logFilterChips" class="log-filter-chips"');
    expect(uiBundle).toContain('id="clearLogFilters" class="mini-btn" type="button" data-log-filter-action="clear" aria-label="清除请求日志筛选，恢复最近日志" hidden');
    expect(uiBundle).toContain('筛选状态');
    expect(uiBundle).toContain('匹配 \' + fmt(visibleCount) + \' 条 · 导出沿用路径/密钥/状态');
    expect(uiBundle).toContain("filterChipMarkup('log', filter)");
    expect(uiBundle).toContain("el('logFilterChips').addEventListener('click'");
    expect(uiBundle).toContain('log-filter-chip');
    expect(uiBundle).toContain('.log-filter-summary');
    expect(uiBundle).toContain('.log-filter-summary:not(.is-empty),');
    expect(uiBundle).toContain('min-height: 32px');
    expect(uiBundle).toContain('.log-panel > .table-scroll { min-height: 0; }');
    expect(uiBundle).toContain('empty / first-run CTAs: 44px touch targets on narrow viewports');
    expect(uiBundle).toContain('min-height: 44px');
    expect(uiBundle).toContain('id="logDiagnostics"');
    expect(uiBundle).toContain('data-log-diagnostic-action="reset"');
    expect(uiBundle).toContain('data-log-diagnostic-action="errors"');
    expect(uiBundle).toContain('data-log-diagnostic-action="rate-limit"');
    expect(uiBundle).toContain('data-log-diagnostic-action="slowest"');
    expect(uiBundle).toContain('class="log-diagnostic-label"');
    expect(uiBundle).toContain('id="logDiagnostics" class="log-diagnostics" aria-label="日志诊断摘要：可重置筛选、筛选异常/429 或按最慢路径收窄"');
    expect(uiBundle).toContain('移除后刷新匹配结果');
    expect(uiBundle).toContain('aria-label="清除请求日志筛选，恢复最近日志"');
    expect(uiBundle).toContain('aria-label="刷新请求日志，重新载入最近窗口"');
    expect(uiBundle).toContain('aria-label="聚焦 requestId 搜索框，输入后收窄日志"');
    expect(uiBundle).toContain('aria-label="清除管理员审计筛选，恢复最近证据"');
    expect(uiBundle).toContain('aria-label="打开密钥池生成新的管理证据"');
    expect(uiBundle).toContain('aria-label="查看当前页首个密钥详情。可在侧栏复核用量与操作"');
    expect(uiBundle).toContain('aria-label="聚焦密钥搜索框。输入后即时收窄列表"');
    expect(uiBundle).toContain('aria-label="清空快速操作搜索，恢复全部命令"');
    expect(uiBundle).toContain('id="logVisibleCount"');
    expect(uiBundle).toContain('id="logErrorCount"');
    expect(uiBundle).toContain('id="logRateLimitCount"');
    expect(uiBundle).toContain('id="logSlowestLatency"');
    expect(uiBundle).toContain('function syncLogDiagnosticAction');
    expect(uiBundle).toContain("syncLogDiagnosticAction('reset', false, '显示日志：' + visibleCountText + '，' + visibleHintText + '。' + resetAction)");
    expect(uiBundle).toContain("syncLogDiagnosticAction('errors', summary.errors === 0, '异常请求：' + errorCountText + '，' + errorRateText + '。' + errorAction)");
    expect(uiBundle).toContain("syncLogDiagnosticAction('rate-limit', summary.rateLimits === 0, '429 请求：' + rateLimitCountText + '，' + rateLimitRateText + '。' + rateLimitAction)");
    expect(uiBundle).toContain("syncLogDiagnosticAction('slowest', !slowestPath, '最慢请求：' + slowestLatencyText + '，' + slowestPathText + '。' + slowestActionLabel)");
    expect(uiBundle).toContain('function runLogDiagnosticAction');
    expect(uiBundle).toContain('function setButtonBusy');
    expect(uiBundle).toContain("el('logDiagnostics').addEventListener('click'");
    expect(uiBundle).toContain("slowestAction.dataset.logDiagnosticValue = slowestPath");
    expect(uiBundle).toContain("applyLogStatusFilter('error', { toast: '已筛选异常请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' })");
    expect(uiBundle).toContain("applyLogStatusFilter('429', { toast: '已筛选 429 请求日志。可继续按路径收窄，或清除筛选恢复全部。' })");
    expect(uiBundle).toContain("el('logPathFilter').value = pathValue");
    expect(uiBundle).toContain("showToast('已按最慢请求路径筛选日志。可点 requestId 查看链路，或清除筛选恢复全部。')");
    expect(uiBundle).toContain('.log-diagnostic-item:hover:not(:disabled)');
    expect(uiBundle).toContain('.log-diagnostic-item:disabled');
    expect(uiBundle).toContain('function summarizeLogRows');
    expect(uiBundle).toContain('function renderLogDiagnostics');
    expect(uiBundle).toContain('function summarizeTrace');
    expect(uiBundle).toContain('function renderTraceSummary');
    expect(uiBundle).toContain('trace-summary-grid');
    expect(uiBundle).toContain('密钥链路');
    expect(uiBundle).toContain('function keyChainMarkup');
    expect(uiBundle).toContain('data-log-key-action="open-detail"');
    expect(uiBundle).toContain('class="log-key-link"');
    expect(uiBundle).toContain('function openKeyDetailFromLog');
    expect(uiBundle).toContain('showKeyOnCurrentPage');
    expect(uiBundle).toContain('openKeyDetailFromLog(keyButton.dataset.keyId)');
    expect(uiBundle).toContain("el('clearLogFilters').addEventListener('click'");
    expect(uiBundle).toContain('function renderTraceEmptyState');
    expect(uiBundle).toContain('data-empty-action="focus-log-search"');
    expect(uiBundle).toContain('也可先刷新日志或搜索 requestId。');
    expect(uiBundle).toContain('trace empty recovery CTAs match log empty-action language');
    expect(uiBundle).toContain('.trace-empty-state .empty-actions .primary-btn');
    expect(uiBundle).toContain("emptyAction.dataset.emptyAction === 'focus-log-search'");
    expect(uiBundle).toContain('function renderTraceShortcuts');
    expect(uiBundle).toContain('function requestIdLabel');
    expect(uiBundle).toContain('trace-shortcuts');
    expect(uiBundle).toContain('trace-shortcut');
    expect(uiBundle).toContain('aria-label="查看请求 ');
    expect(uiBundle).toContain('可展开尝试顺序与密钥链');
    expect(uiBundle).toContain('aria-label="查看最近请求 ');
    expect(uiBundle).toContain('.log-table-scroll td:nth-child(2) { padding: 0 6px; }');
    expect(uiBundle).toContain('.table-scroll[data-overflow-x="false"]');
    expect(uiBundle).toContain('.table-scroll[data-scroll-start="true"]');
    expect(uiBundle).toContain('.table-scroll[data-scroll-end="true"]');
    expect(uiBundle).toContain('function syncTableScrollAffordance');
    expect(uiBundle).toContain('function syncTableScrollAffordances');
    expect(uiBundle).toContain('scroller.dataset.overflowX = String(hasOverflow)');
    expect(uiBundle).toContain('scroller.dataset.scrollStart = String(atStart)');
    expect(uiBundle).toContain('scroller.dataset.scrollEnd = String(atEnd)');
    expect(uiBundle).toContain("document.querySelectorAll('.table-scroll').forEach((scroller) => {");
    expect(uiBundle).toContain("window.addEventListener('resize', debounce(syncTableScrollAffordances, 120))");
    expect(uiBundle).toContain('.link-btn { width: 100%; min-width: 72px; max-width: 84px; min-height: 27px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; overflow: hidden;');
    expect(uiBundle).toContain('.log-key-chain { min-width: 0; width: 100%; max-width: 100%; display: flex; align-items: center; gap: 4px; }');
    expect(uiBundle).toContain('.log-key-link { width: min(112px, 100%); min-width: 0; min-height: 30px; display: inline-flex;');
    expect(uiBundle).toContain('.trace-item-main { min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; }');
    expect(uiBundle).toContain("panel.className = 'trace-panel is-idle'");
    expect(uiBundle).toContain("panel.className = 'trace-panel ' + (rows.length ? 'is-active' : 'is-missing')");
    expect(uiBundle).toContain('请求链路面板：待选择。可点击日志中的 requestId 展开尝试顺序与密钥链');
    expect(uiBundle).toContain('请求链路面板：已展开 ');
    expect(uiBundle).toContain('请求链路面板：未找到 ');
    expect(uiBundle).toContain('.keys-panel .toolbar { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }');
    expect(uiBundle).toContain('action-group security-group');
    expect(uiBundle).toContain('action-group refresh-group');
    expect(uiBundle).toContain('action-group utility-group');
    expect(uiBundle).toContain('id="openCommandPalette" class="ghost-btn command-action" type="button" aria-label="打开快速操作（Ctrl K 或 Cmd K）" aria-haspopup="dialog" aria-controls="commandPalette" aria-expanded="false" aria-keyshortcuts="Control+K Meta+K"');
    expect(uiBundle).toContain('id="commandPalette" class="command-palette-overlay" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle" aria-describedby="commandPaletteHint" hidden');
    expect(uiBundle).toContain('id="commandSearch" class="command-search" type="search" placeholder="搜索命令、页面或操作" autocomplete="off" aria-label="搜索快速操作"');
    expect(uiBundle).toContain('id="commandPaletteContext" class="command-palette-context" role="status" aria-live="polite" aria-atomic="true" aria-label="快速操作范围：待搜索。可输入关键词或方向键选择命令"');
    expect(uiBundle).toContain('id="commandResultCount"');
    expect(uiBundle).toContain('id="commandGroupCount"');
    expect(uiBundle).toContain('id="commandSearchScope"');
    expect(uiBundle).toContain('id="commandList" class="command-list" role="listbox" aria-label="快速操作列表：可搜索命令，或方向键选择后按 Enter 执行"');
    expect(uiBundle).toContain("function toastNextAction");
    expect(uiBundle).toContain('可继续当前操作，或打开相关面板复核');
    expect(uiBundle).toContain("快速操作已打开。可搜索命令，或按 Esc 关闭");
    expect(uiBundle).toContain("关闭快速操作，返回控制台");
    expect(uiBundle).toContain("匹配命令：' + resultText + '。' + nextAction");
    expect(uiBundle).toContain("快速操作范围：匹配 ' + resultText");
    expect(uiBundle).toContain('id="commandEmpty" class="command-empty" hidden');
    expect(uiBundle).toContain('const commandDefinitions');
    expect(uiBundle).toContain("id: 'refresh-logs-list'");
    expect(uiBundle).toContain("id: 'refresh-audit-list'");
    expect(uiBundle).toContain('刷新请求日志列表');
    expect(uiBundle).toContain('刷新审计列表');
    expect(uiBundle).toContain("el('applyLogFilters').click()");
    expect(uiBundle).toContain("el('refreshAuditList').click()");
    expect(uiBundle).toContain('function commandGroupsFor');
    expect(uiBundle).toContain('function syncCommandPaletteContext');
    expect(uiBundle).toContain('function openCommandPalette');
    expect(uiBundle).toContain('function closeCommandPalette');
    expect(uiBundle).toContain('function renderCommandPalette');
    expect(uiBundle).toContain('function trapCommandPaletteFocus');
    expect(uiBundle).toContain('function handleCommandPaletteKeydown');
    expect(uiBundle).toContain('function shouldIgnoreCommandShortcut');
    expect(uiBundle).toContain("el('openCommandPalette').addEventListener('click'");
    expect(uiBundle).toContain("el('commandSearch').addEventListener('input'");
    expect(uiBundle).toContain("el('commandList').addEventListener('click'");
    expect(uiBundle).toContain("event.key.toLowerCase() === 'k'");
    expect(uiBundle).toContain('.command-palette-overlay');
    expect(uiBundle).toContain('.command-palette-context');
    expect(uiBundle).toContain('.command-option');
    expect(uiBundle).toContain('.command-option-meta');
    expect(uiBundle).toContain('命令类型：');
    expect(uiBundle).toContain('.command-action');
    expect(uiBundle).toContain('function syncSecretToggleState');
    expect(uiBundle).toContain("button.textContent = showingPlain ? '隐藏原文' : '显示原文'");
    expect(uiBundle).toContain("密钥显示方式：原文。点击切换为脱敏显示");
    expect(uiBundle).toContain("密钥显示方式：脱敏。点击切换为显示原文");
    expect(uiBundle).toContain("button.setAttribute('aria-pressed', String(showingPlain))");
    expect(uiBundle).toContain("button.classList.toggle('is-plain', showingPlain)");
    expect(uiBundle).toContain('.top-actions { flex: none; width: 100%; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-items: stretch; gap: 5px; }');
    expect(uiBundle).toContain('.security-group { grid-column: span 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); order: 1; }');
    expect(uiBundle).toContain('.refresh-group { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, .78fr) 58px minmax(0, .9fr) minmax(0, .82fr); order: 3; align-items: center; }');
    expect(uiBundle).toContain('.top-actions .ghost-btn { min-width: 0; min-height: 44px; height: 44px;');
    expect(uiBundle).toContain('.utility-group { grid-column: span 3; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); order: 2; }');
    expect(uiBundle).toContain('.log-tools { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px; }');
    expect(uiBundle).toContain('.trace-panel.is-idle { min-height: 0; padding: 8px 12px; }');
    expect(uiBundle).toContain('.trace-panel.is-idle .trace-empty-state { min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; }');
    expect(uiBundle).toContain('.trace-panel.is-idle .empty-actions { display: none; }');
    expect(uiBundle).toContain('.trace-item-main { align-items: flex-start; flex-direction: column; gap: 6px; }');
    expect(uiBundle).toContain('.detail-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }');
    expect(uiBundle).toContain('.detail-facts { grid-template-columns: 1fr; }');
    expect(uiBundle).toContain('.batch-count');
    expect(uiBundle).toContain("document.querySelectorAll('#logsBody, #tracePanel')");
    expect(uiBundle).toContain('没有匹配的请求日志');
    expect(uiBundle).toContain('选择请求 ID 查看链路');
    expect(uiBundle).toContain('没有找到链路记录');
    expect(uiBundle).toContain('.trace-empty-state');
    expect(uiBundle).toContain('.trace-item .mono { white-space: normal; overflow-wrap: anywhere; }');
    expect(uiBundle).toContain('empty-onboarding');
    expect(uiBundle).toContain('first-run-empty');
    expect(uiBundle).toContain('还没有可调度的 Exa Key');
    expect(uiBundle).toContain('data-empty-action="import"');
    expect(uiBundle).toContain('function renderKeyFilteredEmptyState');
    expect(uiBundle).toContain('key-empty-cell');
    expect(uiBundle).toContain('.key-empty-state');
    expect(uiBundle).toContain('data-empty-action="clear-filters"');
    expect(uiBundle).toContain('没有匹配的密钥');
    expect(uiBundle).toContain('function runKeyEmptyAction');
    expect(uiBundle).toContain("action === 'clear-filters'");
    expect(uiBundle).toContain("action === 'import'");
    expect(uiBundle).toContain('id="importPreview" class="import-preview is-empty" role="status" aria-live="polite" aria-atomic="true" aria-label="导入预览：待输入。可粘贴密钥或选择文件后预检"');
    expect(uiBundle).toContain("可点击开始导入提交，或继续修改输入");
    expect(uiBundle).toContain("可粘贴密钥或选择文件后预检");
    expect(uiBundle).toContain("请修正无效行或删除重复项后再试");
    expect(uiBundle).toContain("批量导入已打开。可粘贴密钥或选择文件后预检");
    expect(uiBundle).toContain("previewEl.setAttribute(");
    expect(uiBundle).toContain("'aria-label'");
    expect(uiBundle).toContain("'导入预览：' + recommendation.title");
    expect(uiBundle).toContain('id="trendSummary" class="badge good" role="status" aria-live="polite" aria-atomic="true" aria-label="趋势状态：待同步。可切换观测窗口或等待请求样本"');
    expect(uiBundle).toContain("'趋势状态：' + trendText + (hasAlerts ? '，当前告警 ' + fmt(alerts.length) + ' 条' : '') + '。' + trendNext");
    expect(uiBundle).toContain('class="import-readiness" aria-label="导入前检查：粘贴或选文件后预检，再确认导入"');
    expect(uiBundle).toContain('提交前预检');
    expect(uiBundle).toContain('本地状态库');
    expect(uiBundle).toContain('id="importDropzone" class="import-dropzone" aria-label="拖放或选择密钥文件。内容会填入文本框并预检"');
    expect(uiBundle).toContain('class="import-format-grid" aria-label="支持的导入格式：纯密钥、指定 ID、权重与 JSON 行"');
    expect(uiBundle).toContain('class="import-dropzone-copy"');
    expect(uiBundle).toContain('id="importFileName" class="import-file-name" role="status" aria-live="polite" aria-atomic="true" data-import-file-state="idle"');
    expect(uiBundle).toContain('function setImportFileStatus');
    expect(uiBundle).toContain("target.dataset.importFileState = safeState");
    expect(uiBundle).toContain("safeState === 'error' ? 'assertive' : 'polite'");
    expect(uiBundle).toContain('导入文件已载入：');
    expect(uiBundle).toContain('导入文件错误：');
    expect(uiBundle).toContain('id="importTextarea" class="import-textarea" aria-label="粘贴待导入的密钥列表。输入后会即时预检可导入、重复与无效行"');
    expect(uiBundle).toContain('id="cancelImport" class="ghost-btn" type="button" aria-label="取消批量导入，返回密钥池"');
    expect(uiBundle).toContain('id="confirmImport" class="primary-btn" type="button" aria-label="开始导入不可用。请先粘贴或选择可导入密钥" disabled');
    expect(uiBundle).toContain('id="closeImportModal" class="modal-close" type="button" aria-label="关闭批量导入，返回密钥池"');
    expect(uiBundle).toContain('id="importFileButton" class="ghost-btn file-label" type="button" aria-label="选择密钥导入文件。支持 .txt / .csv / .json"');
    expect(uiBundle).toContain('可拖入或选择 .txt / .csv / .json 文件');
    expect(uiBundle).toContain('id="confirmActionCancel" class="ghost-btn" type="button" aria-label="取消确认操作，返回控制台"');
    expect(uiBundle).toContain('id="confirmActionAccept" class="danger-btn" type="button" aria-label="确认执行危险操作。确认后会写入管理员审计"');
    expect(uiBundle).toContain('id="confirmActionModal" class="modal-overlay" data-confirm-action="" hidden');
    expect(uiBundle).toContain('id="confirmActionTitle" role="status" aria-live="assertive" aria-atomic="true"');
    expect(uiBundle).toContain('id="confirmActionText" class="confirm-action-text" role="status" aria-live="assertive" aria-atomic="true"');
    expect(uiBundle).toContain('id="closeConfirmAction" class="modal-close" type="button" aria-label="关闭确认对话框，返回控制台"');
    expect(uiBundle).toContain('function openConfirmAction');
    expect(uiBundle).toContain("确认操作：' + titleText");
    expect(uiBundle).toContain("确认说明：' + bodyText");
    expect(uiBundle).toContain("危险操作确认：' + titleText");
    expect(uiBundle).toContain("acceptLabel + '：' + titleText + '。确认后会写入管理员审计并立即执行'");
    expect(uiBundle).toContain('function closeConfirmAction');
    expect(uiBundle).toContain('function acceptConfirmAction');
    expect(uiBundle).toContain('function requestPruneLogsConfirm');
    expect(uiBundle).toContain('function requestBatchDisableConfirm');
    expect(uiBundle).toContain('function trapConfirmActionFocus');
    expect(uiBundle).toContain("id: 'prune-logs'");
    expect(uiBundle).toContain("isProblems ? 'batch-disable-problems' : 'batch-disable-selected'");
    expect(uiBundle).toContain("el('pruneLogs').addEventListener('click', () => requestPruneLogsConfirm())");
    expect(uiBundle).toContain("requestBatchDisableConfirm(state.problemKeyIds, 'problems')");
    expect(uiBundle).toContain("requestBatchDisableConfirm(state.selectedKeyIds, 'selected')");
    expect(uiBundle).toContain('.modal.modal-confirm');
    expect(uiBundle).toContain('.confirm-action-text');
    expect(uiBundle).toContain('id="importFileInput" type="file" accept=".txt,.csv,.json" class="sr-only" tabindex="-1"');
    expect(uiBundle).toContain("el('importFileButton').addEventListener('click'");
    expect(uiBundle).toContain('function isSupportedImportFile');
    expect(uiBundle).toContain('function readImportFile');
    expect(uiBundle).toContain("if (file) readImportFile(file)");
    expect(uiBundle).toContain("el('importDropzone').addEventListener('drop'");
    expect(uiBundle).toContain("showToast('仅支持 .txt、.csv 或 .json 文本文件。请改选文本密钥文件后重试。', 'warn')");
    expect(uiBundle).toContain("showToast('未解析到有效密钥。请检查格式（每行一个 Key 或 id:key:weight）后重试。', 'warn')");
    expect(uiBundle).toContain("showToast('该日志关联的密钥不在当前密钥池。可清除密钥筛选，或到密钥池搜索该 ID。', 'warn')");
    expect(uiBundle).toContain("showToast('原始密钥显示已关闭。可在顶部安全区重新开启「显示原文」后再复制。', 'warn')");
    expect(uiBundle).toContain('JSON 行');
    expect(uiBundle).toContain('{"id":"key_01","value":"..."}');
    expect(uiBundle).toContain('function buildImportPreview');
    expect(uiBundle).toContain('function importPreviewRecommendation');
    expect(uiBundle).toContain('function updateImportPreview');
    expect(uiBundle).toContain('function trapImportFocus');
    expect(uiBundle).toContain('function restoreImportFocus');
    expect(uiBundle).toContain('document.activeElement === last');
    expect(uiBundle).toContain("function showToast(message, tone = 'good')");
    expect(uiBundle).toContain("id=\"toast\" class=\"toast\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"");
    expect(uiBundle).toContain("toast.dataset.toastTone = safeTone");
    expect(uiBundle).toContain("tonePrefix + text + (nextAction ? '。' + nextAction : '')");
    expect(uiBundle).toContain("成功提示：");
    expect(uiBundle).toContain("注意：");
    expect(uiBundle).toContain("错误：");
    expect(uiBundle).toContain("safeTone === 'bad' ? 'assertive' : 'polite'");
    expect(uiBundle).toContain('async function keyAction(id, action, sourceButton = null)');
    expect(uiBundle).toContain("const focusAction = action === 'enable' ? 'disable' : action === 'disable' ? 'enable' : action");
    expect(uiBundle).toContain('state.detailFocusAction = focusAction');
    expect(uiBundle).toContain('state.detailFocusUntil = Date.now() + 1600');
    expect(uiBundle).toContain('rowFocusKeyId: null');
    expect(uiBundle).toContain('rowFocusAction: null');
    expect(uiBundle).toContain('rowFocusUntil: 0');
    expect(uiBundle).toContain('function syncRowFocusIntent');
    expect(uiBundle).toContain('state.rowFocusKeyId = id');
    expect(uiBundle).toContain('state.rowFocusAction = rowAction');
    expect(uiBundle).toContain("['test', 'reset', 'toggle'].includes(rowAction)");
    expect(uiBundle).toContain('function runExportLogs');
    expect(uiBundle).toContain('function runExportAudit');
    expect(uiBundle).toContain("setButtonPending(button, '正在导出')");
    expect(uiBundle).toContain("setButtonPending(el('confirmImport'), '正在导入…')");
    expect(uiBundle).toContain("setButtonPending(el('retryRefresh'), '正在重试')");
    expect(uiBundle).toContain("setButtonPending(button, '正在测试')");
    expect(uiBundle).toContain("pendingLabel: '正在清理'");
    expect(uiBundle).toContain("pendingLabel: '正在禁用'");
    expect(uiBundle).toContain("keyAction(row.dataset.keyId, action, button)");
    expect(uiBundle).toContain("keyAction(state.selectedId, button.dataset.detailAction, button)");
    expect(uiBundle).toContain("showToast('请求日志已导出。可在下载目录打开 CSV，或调整筛选后再次导出。')");
    expect(uiBundle).toContain("showToast('审计记录已导出。可在下载目录打开 CSV，或继续筛选审计证据。')");
    expect(uiBundle).toContain('Webhook 测试已发送。可到审计列表确认投递记录');
    expect(uiBundle).toContain('批量操作完成：');
    expect(uiBundle).toContain('可继续筛选状态或打开详情复核');
    expect(uiBundle).toContain('已打开密钥池。可搜索 ID，或筛选健康/异常状态。');
    expect(uiBundle).toContain('已打开请求日志。可搜索 requestId，或按路径/状态筛选。');
    expect(uiBundle).toContain('已聚焦告警建议。可按提示处理，或切换到密钥池/日志复核。');
    expect(uiBundle).toContain('已聚焦观测窗口。可切换 1 小时/24 小时/7 天对比趋势。');
    expect(uiBundle).toContain('日志筛选已清除。可继续搜索 requestId，或按路径/状态收窄。');
    expect(uiBundle).toContain('密钥筛选已清除。可继续搜索 ID，或按状态筛选健康/异常项。');
    expect(uiBundle).toContain('审计筛选已清除。可继续搜索关键词，或按动作/结果收窄。');
    expect(uiBundle).toContain('已按密钥筛选请求日志。可点 requestId 查看链路，或清除筛选恢复全部。');
    expect(uiBundle).toContain('可在密钥池筛选新导入项并测试连通性');
    expect(uiBundle).toContain('function syncToastLift');
    expect(uiBundle).toContain('--toast-lift');
    expect(uiBundle).toContain("data-toast-lift', 'batch'");
    expect(uiBundle).toContain('bottom: calc(16px + var(--toast-lift, 0px))');
    expect(uiBundle).toContain('syncToastLift()');
    expect(uiBundle).toContain("const safeTone = ['good', 'warn', 'bad'].includes(tone) ? tone : 'good'");
    expect(uiBundle).toContain("toast.className = 'toast ' + safeTone");
    expect(uiBundle).toContain('.toast.good');
    expect(uiBundle).toContain('.toast.warn');
    expect(uiBundle).toContain('.toast.bad');
    expect(uiBundle).toContain('id="logPagerHint" class="pager-hint"');
    expect(uiBundle).toContain('最近载入窗口 · 非分页');
    expect(uiBundle).toContain('匹配筛选 · 非分页');
    expect(uiBundle).toContain('.pager-hint');
    expect(uiBundle).not.toContain('每页 10 条');
    expect(uiBundle).toContain('--motion-fast: 140ms;');
    expect(uiBundle).toContain('--motion-medium: 190ms;');
    expect(uiBundle).toContain('--ease-standard: cubic-bezier(.2, .7, .2, 1);');
    expect(uiBundle).toContain('transition: background var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard)');
    expect(uiBundle).toContain('transition: background var(--motion-fast) var(--ease-standard); }');
    expect(uiBundle).toContain('transition: width var(--motion-medium) var(--ease-standard)');
    expect(uiBundle).toContain('tbody tr { cursor: pointer; transition: background var(--motion-fast) var(--ease-standard); }');
    expect(uiBundle).not.toContain('transition: background .14s ease');
    expect(uiBundle).not.toContain('transition: background .15s ease');
    expect(uiBundle).not.toContain('transition: width .3s ease');
    expect(uiBundle).toContain('.refresh-status.is-syncing');
    expect(uiBundle).toContain('.refresh-status.is-updated');
    expect(uiBundle).toContain('.refresh-status.is-failed');
    expect(uiBundle).toContain('@keyframes tab-panel-enter');
    expect(uiBundle).toContain('@keyframes modal-panel-enter');
    expect(uiBundle).toContain('@keyframes toast-enter');
    expect(uiBundle).toContain('animation: tab-panel-enter var(--motion-medium) var(--ease-standard);');
    expect(uiBundle).toContain('.modal-overlay.modal-open { display: flex; animation: modal-overlay-enter var(--motion-fast) ease-out; }');
    expect(uiBundle).toContain('.modal-overlay.modal-open .modal { animation: modal-panel-enter var(--motion-medium) var(--ease-standard); }');
    expect(uiBundle).toContain('animation: toast-enter var(--motion-fast) var(--ease-standard);');
    expect(uiBundle).toContain('@media (prefers-reduced-motion: reduce)');
    expect(uiBundle).toContain("showToast('Webhook 测试失败：' + (error.message || '未知错误') + '。请检查 Webhook URL 与网络后重试。', 'bad')");
    expect(uiBundle).toContain("function showErrorToast(error, fallback = '操作未完成')");
    expect(uiBundle).toContain("showToast(sentence + '请检查网络、权限或筛选条件后重试。', 'bad')");
    expect(uiBundle).toContain("showErrorToast(error, '操作未完成')");
    expect(uiBundle).toContain('showErrorToast(error)');
    expect(uiBundle).not.toContain("showToast(error.message, 'bad')");
    expect(uiBundle).toContain("showToast('剪贴板写入失败，请检查浏览器权限或使用 HTTPS 后重试。', 'bad')");
    expect(uiBundle).toContain("showToast('暂无最慢请求样本。请等待新请求写入日志后再试。', 'warn')");
    expect(uiBundle).toContain("showToast('暂无最新审计线索。请完成一次管理操作或刷新审计列表后再试。', 'warn')");
    expect(uiBundle).toContain('可清除筛选恢复最近日志');
    expect(uiBundle).toContain('可一键清除筛选，或调整关键词与状态条件后继续管理密钥池。');
    expect(uiBundle).toContain('可清空搜索恢复全部命令，或改用“密钥”“日志”“审计”“导出”“刷新”等词重试。');
    expect(uiBundle).toContain('data-command-empty-action="clear-search"');
    expect(uiBundle).toContain('data-command-empty-action="suggest-keys"');
    expect(uiBundle).toContain("action === 'clear-search'");
    expect(uiBundle).toContain("action === 'suggest-keys'");
    expect(uiBundle).toContain('command empty recovery CTAs match log/audit empty-action language');
    expect(uiBundle).toContain('.command-empty .empty-actions .primary-btn');
    expect(uiBundle).toContain("showToast('请求日志导出失败：' + (error.message || '未知错误') + '。请检查筛选条件或网络后重试。', 'bad')");
    expect(uiBundle).toContain("showToast('审计导出失败：' + (error.message || '未知错误') + '。请检查筛选条件或网络后重试。', 'bad')");
    expect(uiBundle).toContain("showToast('导入失败：' + (error.message || '未知错误') + '。请检查文件格式后重试。', 'bad')");
    expect(uiBundle).toContain("showLogin(error.message || '登录失败。请检查管理员令牌或网络后重试。')");
    expect(uiBundle).toContain('已安全退出。重新输入管理员令牌即可再次进入控制台。');
    expect(uiBundle).toContain("safeTone === 'bad' ? 4800 : 3200");
    expect(uiBundle).toContain("showToast('没有可批量处理的密钥。请先勾选密钥，或筛选异常项后再试。', 'warn')");
    expect(uiBundle).toContain('JSON 格式无法解析');
    expect(uiBundle).toContain('重复密钥已跳过');
    expect(uiBundle).toContain('重复 ID 已跳过');
    expect(uiBundle).toContain('preview.keys.length === 0');
    expect(uiBundle).toContain('.import-preview.has-warnings');
    expect(uiBundle).toContain('.import-preview.is-blocked');
    expect(uiBundle).toContain('.import-stats');
    expect(uiBundle).toContain('.import-recommendation');
    expect(uiBundle).toContain('可导入，但有跳过项');
    expect(uiBundle).toContain('displayLabel');
    expect(uiBundle).toContain('测试密钥');
    expect(uiBundle).toContain('操作反馈');
    expect(uiBundle).toContain('重置冷却');
    expect(uiBundle).toContain('禁用密钥');
    expect(uiBundle).toContain('上游超时');
    expect(uiBundle).toContain('连接异常');
    expect(uiBundle).toContain('临时错误');
    expect(uiBundle).not.toContain('添加密钥');
    expect(uiBundle).toContain('id="applyLogFilters" class="ghost-btn" type="button" aria-label="重新载入当前筛选范围的请求日志。可继续点 requestId 看链路"');
    expect(uiBundle).toContain('id="refreshAuditList" class="ghost-btn" type="button" aria-label="重新载入最近管理员审计窗口。可继续按动作/结果筛选"');
    expect(uiBundle).toContain('function reloadAudit');
    expect(uiBundle).toContain("api('/_proxy/audit?limit=12')");
    expect(uiBundle).toContain("data-empty-action=\"refresh-audit\"");
    expect(uiBundle).toContain('data-empty-action="open-keys"');
    expect(uiBundle).toContain('可先刷新窗口，或到密钥池完成一次导入/测试后回来查看。');
    expect(uiBundle).toContain("emptyAction.dataset.emptyAction === 'open-keys'");
    expect(uiBundle).toContain('已打开密钥池，完成操作后可回到审计查看证据');
    expect(uiBundle).toContain("pendingText: '正在刷新'");
    expect(uiBundle).toContain('已清空快速操作搜索。可继续输入关键词，或用方向键选择操作。');
    expect(uiBundle).toContain('已用「密钥」重试搜索。可 Enter 执行匹配项，或改搜「日志」「审计」。');
    expect(uiBundle).toContain('审计证据导出已开始。可在下载目录打开 CSV，或继续筛选审计证据。');
    expect(uiBundle).toContain('未找到可复制的命令。请刷新上线检查，或手动对照配置项。');
    expect(uiBundle).toContain('文件读取失败，请重新选择文本密钥文件后重试。');
    expect(uiBundle).toContain('趋势视图');
    expect(uiBundle).toContain('告警中心');
    expect(uiBundle).toContain('管理员审计');
    expect(uiBundle).toContain('function renderAuditSummary');
    expect(uiBundle).toContain('function renderAuditEvidence');
    expect(uiBundle).toContain('function renderAuditEmptyState');
    expect(uiBundle).toContain('const auditActionLabels');
    expect(uiBundle).toContain('function auditFilterState');
    expect(uiBundle).toContain('function auditSearchText');
    expect(uiBundle).toContain('function filterAuditRows');
    expect(uiBundle).toContain('function renderAuditFilterSummary');
    expect(uiBundle).toContain('function clearAuditFilters');
    expect(uiBundle).toContain('function removeAuditFilterDimension');
    expect(uiBundle).toContain('function syncAuditEvidenceAction');
    expect(uiBundle).toContain("syncAuditEvidenceAction('reset', false, '已载入证据：' + totalText + '，' + windowText + '。' + resetAction)");
    expect(uiBundle).toContain("syncAuditEvidenceAction('failures', failures === 0, '失败审计：' + failureText + '，' + failureRateText + '。' + failureAction)");
    expect(uiBundle).toContain("syncAuditEvidenceAction('latest', !latestSearch, '最新线索：' + latestActor + '，' + actionText + '。' + latestActionHint)");
    expect(uiBundle).toContain("syncAuditEvidenceAction('export', !exportReady, '导出状态：' + exportText + '，' + exportHintText + '。' + exportAction)");
    expect(uiBundle).toContain('function runAuditEvidenceAction');
    expect(uiBundle).toContain('filterAuditRows(sourceRows, filters)');
    expect(uiBundle).toContain("匹配 ' + fmt(visibleCount) + ' 条 · 窗口最近 ' + fmt(AUDIT_LIST_WINDOW) + ' 条 · 导出沿用动作/结果");
    expect(uiBundle).toContain("filterChipMarkup('audit', filter)");
    expect(uiBundle).toContain('导出沿用动作与结果筛选');
    expect(uiBundle).toContain('没有匹配的审计记录');
    expect(uiBundle).toContain('auditQueryParams');
    expect(uiBundle).toContain("params.set('success', 'true')");
    expect(uiBundle).toContain("params.set('success', 'false')");
    expect(uiBundle).toContain("el('auditSearch').addEventListener('input', debounce(renderAudit, 250))");
    expect(uiBundle).toContain("el('auditActionFilter').addEventListener('change', renderAudit)");
    expect(uiBundle).toContain("el('auditOutcomeFilter').addEventListener('change', renderAudit)");
    expect(uiBundle).toContain("el('clearAuditFilters').addEventListener('click', clearAuditFilters)");
    expect(uiBundle).toContain("el('auditFilterChips').addEventListener('click'");
    expect(uiBundle).toContain("el('auditEvidence').addEventListener('click'");
    expect(uiBundle).toContain("event.target.closest('button[data-audit-evidence-action]')");
    expect(uiBundle).toContain('.audit-tools');
    expect(uiBundle).toContain('.audit-filter-summary');
    expect(uiBundle).toContain('.audit-filter-chip');
    expect(uiBundle).toContain('audit-meta-grid');
    expect(uiBundle).toContain('audit-detail');
    expect(uiBundle).toContain('function auditActionLabel');
    expect(uiBundle).toContain('管理员登录');
    expect(uiBundle).toContain('批量禁用密钥');
    expect(uiBundle).toContain('测试告警 Webhook');
    expect(uiBundle).toContain('自动清理过期日志');
    expect(uiBundle).toContain('class="audit-action-code"');
    expect(uiBundle).toContain('.audit-action-code');
    expect(uiBundle).toContain('id="exportLogs" class="ghost-btn" type="button" aria-label="导出当前筛选范围的请求日志 CSV。下载后可离线复核"');
    expect(uiBundle).toContain('id="exportAudit" class="ghost-btn" type="button" aria-label="导出当前筛选范围的审计记录 CSV。下载后可离线复核"');
    expect(uiBundle).toContain('id="pruneLogs" class="danger-btn" type="button" aria-label="清理超过保留期的过期请求日志。确认后会写入管理员审计"');
    expect(uiBundle).toContain('id="timeRange" class="select" aria-label="趋势时间范围。选择后刷新观测窗口"');
    expect(uiBundle).toContain('id="logout" class="ghost-btn session-exit" type="button" aria-label="退出管理员登录。退出后需重新输入令牌进入控制台"');
    expect(uiBundle).toContain('id="testWebhook" class="ghost-btn utility-action" type="button" aria-label="发送告警 Webhook 测试。结果会以提示反馈"');
    expect(uiBundle).toContain('id="refresh" class="ghost-btn refresh-action" type="button" aria-label="立即刷新控制台状态。可观察同步状态与实时链路"');
    expect(uiBundle).toContain('id="bulkImportBtn" class="primary-btn" type="button" aria-label="打开批量导入密钥。可粘贴或选择文件后预检再提交"');
    expect(uiBundle).toContain('id="batchTestPage" class="ghost-btn" type="button" aria-label="测试当前页密钥。结果会写入审计并可在详情复核"');
    expect(uiBundle).toContain('id="batchDisableProblems" class="danger-btn" type="button" aria-label="禁用异常密钥。确认后会写入管理员审计"');
    expect(uiBundle).toContain('id="clearKeyFilters" class="mini-btn" type="button" data-key-filter-action="clear" aria-label="清除密钥池筛选，恢复全部密钥" hidden');
    expect(uiBundle).toContain('id="clearLogFilters" class="mini-btn" type="button" data-log-filter-action="clear" aria-label="清除请求日志筛选，恢复最近日志" hidden');
    expect(uiBundle).toContain('id="clearAuditFilters" class="mini-btn" type="button" data-audit-filter-action="clear" aria-label="清除管理员审计筛选，恢复最近审计" hidden');
    expect(uiBundle).toContain('导出</button>');
    expect(uiBundle).toContain('隐藏原文');
    expect(uiBundle).toContain('data-console-shell');
    expect(uiBundle).toContain('details-sticky');
    expect(uiBundle).toContain('/_proxy/keys');
    expect(uiBundle).toContain('/_proxy/logs');
    expect(uiBundle).toContain("localStorage.getItem('exaProxyAdminToken')");
    expect(uiBundle).toContain('Microsoft YaHei UI');
    expect(uiBundle).toContain('brand-title');
    expect(uiBundle).toContain('log-path');
    expect(uiBundle).toContain('log-chain');
    expect(uiBundle).not.toContain('data-nav-target=');
    expect(uiBundle).not.toContain('aria-label="主导航"');
    expect(uiBundle).toContain('data-tab-panel="keys"');
    expect(uiBundle).toContain("activeTab: 'overview'");
    expect(uiBundle).toContain('class="nav-item mobile-tab active" data-tab="overview" role="tab" aria-selected="true"');
    expect(uiBundle).toContain('class="nav-item mobile-tab" data-tab="keys" role="tab" aria-selected="false"');
    expect(uiBundle).toContain('class="nav-item active" data-tab="overview" role="tab" aria-selected="true"');
    expect(uiBundle).toContain('class="nav-item" data-tab="keys" role="tab" aria-selected="false"');
    expect(uiBundle).toContain('class="tab-panel active" data-tab-panel="overview"');
    expect(uiBundle).toContain('class="tab-panel" data-tab-panel="keys"');
    expect(uiBundle).not.toContain('switchView');
    expect(uiBundle).toContain('运行配置');
    expect(uiBundle).toContain('function setEvidenceCell');
    expect(uiBundle).toContain('id="readinessHttpsValue" role="status" aria-live="polite" aria-atomic="true" aria-label="HTTPS 管理：待同步。可继续观察，或到配置详情复核"');
    expect(uiBundle).toContain('id="configEvidenceHttps" role="status" aria-live="polite" aria-atomic="true" aria-label="HTTPS 管理：待同步。点击查看配置详情并继续观察"');
    expect(uiBundle).toContain("valueEl.setAttribute('aria-label', framed + (hintText ? '。' + hintText : '') + '。' + nextAction)");
    expect(uiBundle).toContain("button.setAttribute('aria-label', framed + (hintText ? '。' + hintText : '') + '。' + nextAction)");
    expect(uiBundle).toContain("tone === 'warn'");
    expect(uiBundle).toContain('点击查看配置详情并对照上线建议');
    expect(uiBundle).toContain('点击查看配置详情并继续观察');
    expect(uiBundle).toContain('可继续观察，或到配置详情复核');
    expect(uiBundle).toContain('上线前建议核对，可到配置详情处理');
    expect(uiBundle).toContain('建议点击配置详情对照上线建议复核');
    expect(uiBundle).toContain('请尽快到配置详情处理');
    expect(uiBundle).toContain("card.setAttribute('aria-label', framed)");
    expect(uiBundle).toContain("const readinessStatusLabels = {");
    expect(uiBundle).toContain("const evidenceStatusLabels = {");
    expect(uiBundle).toContain("readinessHttps: 'HTTPS 管理'");
    expect(uiBundle).toContain("configEvidencePaths: '路径策略'");
    expect(uiBundle).toContain('metric-head');
    expect(uiBundle).toContain('metric-chip');
    expect(uiBundle).toContain('metric-meter');
    expect(uiBundle).toContain('metric-meter-fill');
    expect(uiBundle).toContain('id="usageMeter"');
    expect(uiBundle).toContain('id="successMeter"');
    expect(uiBundle).toContain('id="rateLimitMeter"');
    expect(uiBundle).toContain('id="latencyMeter"');
    expect(uiBundle).toContain('id="failureMeter"');
    expect(uiBundle).toContain('updateMetricMeters');
    expect(uiBundle).toContain('keyPageSize: 50');
    expect(uiBundle).toContain('id="prevKeyPage" class="mini-btn" type="button" aria-label="密钥池上一页不可用。已在第一页"');
    expect(uiBundle).toContain('id="nextKeyPage" class="mini-btn" type="button" aria-label="密钥池下一页。前往下一页密钥"');
    expect(uiBundle).toContain("当前页面：' + meta.label + '。' + meta.next");
    expect(uiBundle).toContain("切换到' + meta.label + '。' + meta.next");
    expect(uiBundle).toContain('密钥池上一页不可用。已在第一页');
    expect(uiBundle).toContain("密钥池下一页。前往第 ' + fmt(state.keyPage + 1) + ' 页");
    expect(uiBundle).toContain('role="tablist" aria-label="控制台导航。可切换概览、密钥池、请求日志、审计与配置"');
    expect(uiBundle).toContain('aria-label="当前页面：概览。可查看运行态势、趋势与告警"');
    expect(uiBundle).toContain('aria-label="切换到密钥池。可管理密钥、筛选并批量操作"');
    expect(uiBundle).toContain('id="sidebarCollapse" type="button" aria-label="侧栏导航：已展开。点击收起为图标导航" aria-expanded="true" aria-pressed="false"');
    expect(uiBundle).toContain('function syncSidebarCollapseControl');
    expect(uiBundle).toContain("collapseBtn.setAttribute('aria-expanded', String(!isCollapsed))");
    expect(uiBundle).toContain("collapseBtn.setAttribute('aria-pressed', String(isCollapsed))");
    expect(uiBundle).toContain("isCollapsed");
    expect(uiBundle).toContain('侧栏导航：已收起。点击展开完整导航标签');
    expect(uiBundle).toContain('侧栏导航：已展开。点击收起为图标导航');
    expect(uiBundle).toContain('id="closeMobileDetails" class="ghost-btn" type="button" aria-label="关闭移动端密钥详情，返回密钥表"');
    expect(uiBundle).toContain('function closeMobileDetailsPanel');
    expect(uiBundle).toContain("state.mobileDetailsOpen = false");
    expect(uiBundle).toContain('移动端密钥详情已打开。可复核用量与操作，或关闭返回密钥表');
    expect(uiBundle).toContain('关闭移动端密钥详情，返回密钥表');
    expect(uiBundle).toContain('button[data-action="select"]');
    expect(uiBundle).toContain('target.focus({ preventScroll: true })');
    expect(uiBundle).toContain("data-action=\"test\"");
    expect(uiBundle).toContain("'/test'");
    expect(uiBundle).not.toContain('.metric-meter-fill.green { width:');
    expect(uiBundle).not.toContain('.metric-meter-fill.amber { width:');
    expect(uiBundle).not.toContain('.metric-meter-fill.red { width:');
    expect(uiBundle).toContain('运行态势');
    expect(uiBundle).toContain('id="opsSeverity" class="badge good" role="status" aria-live="polite" aria-atomic="true" aria-label="运行态势：稳定。可继续观察运行态势"');
    expect(uiBundle).toContain('id="opsAlert" class="ops-alert good" role="status" aria-live="polite" aria-atomic="true" aria-label="运行提示：暂无需要人工处理的告警。可继续观察运行态势"');
    expect(uiBundle).toContain("severityEl.setAttribute('aria-label', '运行态势：' + severityText + '。' + severityNext)");
    expect(uiBundle).toContain("alertEl.setAttribute('role', severity === 'bad' ? 'alert' : 'status')");
    expect(uiBundle).toContain("alertEl.setAttribute('aria-live', severity === 'bad' ? 'assertive' : 'polite')");
    expect(uiBundle).toContain("healthyEl.setAttribute('aria-label', '健康密钥：' + fmt(totals.healthy) + '。' + (totals.healthy ? '可继续观察调度，或打开密钥池复核' : '请导入或恢复可用密钥，可打开密钥池处理'))");
    expect(uiBundle).toContain("cooldownEl.setAttribute('aria-label', '冷却处理：' + fmt(totals.cooldown) + '。' + (totals.cooldown ? '可打开密钥池筛选异常项并重置冷却' : '当前无需处理冷却，可继续观察'))");
    expect(uiBundle).toContain("disabledEl.setAttribute('aria-label', '已禁用密钥：' + fmt(totals.disabled) + '。' + (totals.disabled ? '可打开密钥池筛选禁用项并评估是否恢复' : '当前没有禁用密钥，可继续观察'))");
    expect(uiBundle).toContain('id="latestStatus" class="badge good" role="status" aria-live="polite" aria-atomic="true" aria-label="链路状态：无异常。可继续观察最近请求，或打开日志复核"');
    expect(uiBundle).toContain("latestStatusEl.setAttribute('aria-label', '链路状态：' + latestStatusText + '。' + latestNext)");
    expect(uiBundle).toContain("latestErrorEl.setAttribute('aria-label', '最近错误：' + latestErrorText + '。' + (latestErrorLog ? '可打开日志筛选异常请求' : '当前无错误样本，可继续观察'))");
    expect(uiBundle).toContain("latestPathEl.setAttribute('aria-label', '最后路径：' + latestPathText + '。' + (latestLog ? '可到请求日志按路径收窄' : '等待新请求样本'))");
    expect(uiBundle).toContain("latestChainEl.setAttribute('aria-label', '密钥链路：' + latestChainText + '。' + (latestLog ? '可打开密钥详情复核' : '等待链路样本'))");
    expect(uiBundle).toContain("latestStatusEl.setAttribute('role', latestTone === 'bad' ? 'alert' : 'status')");
    expect(uiBundle).toContain('id="governanceHttps" role="status" aria-live="polite" aria-atomic="true" aria-label="安全 HTTPS：待同步。可到配置详情查看并继续观察"');
    expect(uiBundle).toContain('function setGovernanceStatus');
    expect(uiBundle).toContain("setGovernanceStatus('governanceHttps', httpsText, '安全 HTTPS'");
    expect(uiBundle).toContain("setGovernanceStatus('governanceRawKey', rawKeyText, '原始密钥策略'");
    expect(uiBundle).toContain("setGovernanceStatus('governanceSession', ttlText, '会话策略'");
    expect(uiBundle).toContain("setGovernanceStatus('governancePathPolicy', pathText, '路径策略'");
    expect(uiBundle).toContain("setGovernanceStatus('governanceRetention', daysText, '日志保留'");
    expect(uiBundle).toContain("setGovernanceStatus('governanceExpired', expiredText, '过期日志'");
    expect(uiBundle).toContain("setGovernanceStatus('governanceRetentionWindow', retentionWindowText, '保留窗口'");
    expect(uiBundle).toContain("label + '：' + statusText + '。' + nextAction");
    expect(uiBundle).toContain('运行洞察');
    expect(uiBundle).toContain('insight-band');
    expect(uiBundle).toContain('function setTrendRecapAria');
    expect(uiBundle).toContain("setTrendRecapAria('trendRequests', '窗口请求'");
    expect(uiBundle).toContain("setTrendRecapAria('trendFailures', '失败'");
    expect(uiBundle).toContain("setTrendRecapAria('trendRateLimits', '429 压力'");
    expect(uiBundle).toContain("setTrendRecapAria('trendPeak', '峰值桶'");
    expect(uiBundle).toContain('点击调整趋势观测窗口对比时段');
    expect(uiBundle).toContain('点击筛选趋势失败日志并查看链路');
    expect(uiBundle).toContain('点击筛选趋势 429 日志并收窄路径');
    expect(uiBundle).toContain('点击调整趋势峰值观测窗口');
    expect(uiBundle).toContain("点击打开请求日志复核该阶段流量");
    expect(uiBundle).toContain("点击打开密钥池复核调度状态");
    expect(uiBundle).toContain("点击筛选异常密钥并评估处理");
    expect(uiBundle).toContain('aria-label="客户端令牌：待请求。点击打开请求日志复核该阶段流量"');
    expect(uiBundle).toContain('aria-label="窗口请求：0。点击调整趋势观测窗口对比时段"');
    expect(uiBundle).toContain('id="proxyFlowMap" class="proxy-flow-map" aria-label="代理链路地图。可点击节点打开日志或密钥池复核"');
    expect(uiBundle).toContain('class="ops-strip" aria-label="运行态势。可观察健康密钥、冷却与最近链路诊断"');
    expect(uiBundle).toContain('class="trend-grid" aria-label="趋势与告警。可调整窗口、点击摘要或处理告警"');
    expect(uiBundle).toContain('data-tab-panel="keys" role="tabpanel" aria-label="密钥池。可搜索筛选、导入并管理密钥"');
    expect(uiBundle).toContain('data-tab-panel="logs" role="tabpanel" aria-label="请求日志。可筛选请求并查看链路"');
    expect(uiBundle).toContain('data-tab-panel="audit" role="tabpanel" aria-label="审计与配置。可复核审计证据与上线配置"');
    expect(uiBundle).toContain('aria-label="冷却处理：0。当前无需处理冷却，可继续观察"');
    expect(uiBundle).toContain('aria-label="已禁用密钥：0。当前没有禁用密钥，可继续观察"');
    expect(uiBundle).toContain('aria-label="最近错误：-。当前无错误样本，可继续观察"');
    expect(uiBundle).toContain('id="proxyFlowToken" class="proxy-flow-node overview-signal blue" type="button" data-overview-signal-action="logs-focus"');
    expect(uiBundle).toContain('id="proxyFlowProxy" class="proxy-flow-node overview-signal good" type="button" data-overview-signal-action="logs-focus"');
    expect(uiBundle).toContain('id="proxyFlowKey" class="proxy-flow-node overview-signal good" type="button" data-overview-signal-action="keys"');
    expect(uiBundle).toContain('id="proxyFlowUpstream" class="proxy-flow-node overview-signal blue" type="button" data-overview-signal-action="logs-focus"');
    expect(uiBundle).toContain("node.setAttribute('aria-label', stage + '：' + valueText + '。' + actionHint)");
    expect(uiBundle).toContain("actionHint = {");
    expect(uiBundle).toContain("'keys-problem': '点击筛选异常密钥并评估处理'");
    expect(uiBundle).toContain('待同步后汇总最近请求、密钥池和上游响应。');
    expect(uiBundle).toContain('从客户端令牌到 Exa 上游');
    expect(uiBundle).toContain('客户端令牌');
    expect(uiBundle).toContain('代理入口');
    expect(uiBundle).toContain('Exa 上游');
    expect(uiBundle).toContain('function renderProxyFlowMap');
    expect(uiBundle).toContain('function setProxyFlowNode');
    expect(uiBundle).toContain('id="recentActivityRail" class="recent-activity-rail" aria-label="最近请求活动。可点击条目打开日志或导入密钥"');
    expect(uiBundle).toContain('id="recentActivityList" class="recent-activity-list" role="status" aria-live="polite" aria-atomic="true" aria-label="最近请求活动"');
    expect(uiBundle).toContain('点击筛选 429 请求日志并收窄路径');
    expect(uiBundle).toContain('点击筛选异常请求日志并查看链路');
    expect(uiBundle).toContain('点击打开请求日志复核该请求');
    expect(uiBundle).toContain('点击打开请求日志查看是否已有流量');
    expect(uiBundle).toContain("title.setAttribute('aria-label', '最近活动：' + titleText + '。' + nextAction)");
    expect(uiBundle).toContain("meta.setAttribute('aria-label', '最近活动说明：' + metaText");
    expect(uiBundle).toContain("list.setAttribute('aria-label', '最近请求活动：' + titleText");
    expect(uiBundle).toContain("const ariaLabel = '最近请求：' + method + ' ' + path + '，状态 ' + statusTextValue + '，耗时 ' + latency + '。' + nextHint");
    expect(uiBundle).toContain('function renderRecentActivityRail');
    expect(uiBundle).toContain('recent-activity-empty');
    expect(uiBundle).toContain('用客户端令牌发起探测请求后，这里会显示最近 4 次链路证据。');
    expect(uiBundle).toContain('导入至少一把密钥后，再发起代理请求形成活动样本。');
    expect(uiBundle).toContain('data-overview-signal-action="logs-focus"');
    expect(uiBundle).toContain('data-overview-signal-action="import-keys"');
    expect(uiBundle).toContain('recent activity empty recovery CTAs match trend/log empty-action language');
    expect(uiBundle).toContain('.recent-activity-empty .empty-actions .primary-btn');
    expect(uiBundle).toContain('function renderActivityItem');
    expect(uiBundle).toContain('recent.map(renderActivityItem).join');
    expect(uiBundle).toContain('esc(ariaLabel)');
    expect(uiBundle).toContain('class="recent-activity-item overview-signal ');
    expect(uiBundle).toContain("data-overview-signal-action=\"' + esc(action) + '\"");
    expect(uiBundle).toContain('id="insightJudgement"');
    expect(uiBundle).toContain('id="insightNextAction"');
    expect(uiBundle).toContain('class="summary-cell overview-signal" type="button" data-overview-signal-action="keys"');
    expect(uiBundle).toContain('class="summary-cell overview-signal" type="button" data-overview-signal-action="logs-focus"');
    expect(uiBundle).toContain('class="metric-card overview-signal amber" type="button" data-overview-signal-action="log-rate-limit"');
    expect(uiBundle).toContain('class="metric-card overview-signal red" type="button" data-overview-signal-action="log-errors"');
    expect(uiBundle).toContain('class="trend-recap-item overview-signal" type="button" data-overview-signal-action="trend-focus"');
    expect(uiBundle).toContain('id="insightNextActionButton" class="insight-action" type="button" data-overview-action="keys-problem" data-overview-signal-action="keys-problem"');
    expect(uiBundle).toContain('function runOverviewAction');
    expect(uiBundle).toContain('button[data-overview-signal-action], button[data-overview-action]');
    expect(uiBundle).toContain('button.dataset.overviewSignalAction || button.dataset.overviewAction');
    expect(uiBundle).toContain('runOverviewAction(actionId, button).catch');
    expect(uiBundle).toContain("if (actionId === 'keys')");
    expect(uiBundle).toContain("if (actionId === 'log-errors')");
    expect(uiBundle).toContain("if (actionId === 'log-rate-limit')");
    expect(uiBundle).toContain("if (actionId === 'alert-focus')");
    expect(uiBundle).toContain('function focusAlertTarget');
    expect(uiBundle).toContain('state.alertFocusUntil');
    expect(uiBundle).toContain("alertTarget.focus({ preventScroll: true })");
    expect(uiBundle).toContain('async function applyLogStatusFilter');
    expect(uiBundle).toContain("applyLogStatusFilter('error'");
    expect(uiBundle).toContain("applyLogStatusFilter('429'");
    expect(uiBundle).toContain('dataset.overviewSignalAction = actionId');
    expect(uiBundle).toContain("{ id: 'import-keys', label: '导入密钥' }");
    expect(uiBundle).toContain("{ id: 'keys-problem', label: '查看异常密钥' }");
    expect(uiBundle).toContain("{ id: 'logs-focus', label: '查看请求日志' }");
    expect(uiBundle).toContain("{ id: 'trend-focus', label: '调整观测窗口' }");
    expect(uiBundle).toContain('.insight-action');
    expect(uiBundle).toContain('.overview-signal');
    expect(uiBundle).toContain('.proxy-flow-map');
    expect(uiBundle).toContain('.proxy-flow-node.good');
    expect(uiBundle).toContain('.proxy-flow-link::after');
    expect(uiBundle).toContain('.recent-activity-rail');
    expect(uiBundle).toContain('.recent-activity-list');
    expect(uiBundle).toContain('.recent-activity-item.good:hover:not(:disabled)');
    expect(uiBundle).toContain('.recent-activity-empty');
    expect(uiBundle).toContain('.overview-signal:hover:not(:disabled)');
    expect(uiBundle).toContain('.overview-signal:disabled');
    expect(uiBundle).toContain('.metric-card.overview-signal.amber:hover:not(:disabled)');
    expect(uiBundle).toContain('.trend-recap-item[data-overview-signal-action="log-rate-limit"]');
    expect(uiBundle).toContain('id="insightWindow"');
    expect(uiBundle).toContain('当前判断');
    expect(uiBundle).toContain('观测窗口');
    expect(uiBundle).toContain('function setInsightCard');
    expect(uiBundle).toContain('id="insightJudgementTitle" role="status" aria-live="polite" aria-atomic="true" aria-label="当前判断：待同步。可继续观察运行态势"');
    expect(uiBundle).toContain("titleEl.setAttribute('aria-label', labels.title + '：' + title + '。' + nextAction)");
    expect(uiBundle).toContain("textEl.setAttribute('aria-label', labels.text + '：' + text + '。' + nextAction)");
    expect(uiBundle).toContain("actionButton.setAttribute('aria-label', '点击执行下一步：' + actionLabel + (text ? '。' + text : ''))");
    expect(uiBundle).toContain("可点击执行下一步：' + actionLabel");
    expect(uiBundle).toContain('请优先处理异常，并打开相关面板复核');
    expect(uiBundle).toContain('建议继续排查，可打开密钥池或请求日志');
    expect(uiBundle).toContain("summaryEl.setAttribute('aria-label', '代理链路摘要：' + summary + summaryNext)");
    expect(uiBundle).toContain("id=\"proxyFlowSummary\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"");
    expect(uiBundle).toContain("const live = tone === 'bad' ? 'assertive' : 'polite'");
    expect(uiBundle).toContain("insightJudgement: { title: '当前判断', text: '当前判断说明' }");
    expect(uiBundle).toContain("insightNextAction: { title: '下一步', text: '下一步说明' }");
    expect(uiBundle).toContain("insightWindow: { title: '观测窗口', text: '观测窗口说明' }");
    expect(uiBundle).toContain('function updateOverviewInsights');
    expect(uiBundle).toContain('密钥池尚未配置');
    expect(uiBundle).toContain('查看异常密钥与日志');
    expect(uiBundle).toContain('趋势桶');
    expect(uiBundle).toContain('id="trendRecap"');
    expect(uiBundle).toContain('id="trendRequests"');
    expect(uiBundle).toContain('id="trendFailures"');
    expect(uiBundle).toContain('id="trendRateLimits"');
    expect(uiBundle).toContain('id="trendPeak"');
    expect(uiBundle).toContain('function summarizeTrends');
    expect(uiBundle).toContain('function renderTrendRecap');
    expect(uiBundle).toContain('trend-empty');
    expect(uiBundle).toContain('function trendEmptyMarkup');
    expect(uiBundle).toContain('可先切换 1 小时 / 7 天观测窗口，或打开请求日志确认是否已有流量。');
    expect(uiBundle).toContain('data-overview-signal-action="trend-focus"');
    expect(uiBundle).toContain('data-overview-signal-action="logs-focus"');
    expect(uiBundle).toContain('调整观测窗口');
    expect(uiBundle).toContain('查看请求日志');
    expect(uiBundle).toContain('trend empty recovery CTAs match log/audit empty-action language');
    expect(uiBundle).toContain('.trend-empty .empty-actions .primary-btn');
    expect(uiBundle).toContain('alert-empty');
    expect(uiBundle).toContain('function alertEmptyMarkup');
    expect(uiBundle).toContain('可随时打开密钥池或请求日志复核运行证据。');
    expect(uiBundle).toContain('alert empty monitoring CTAs match trend empty-action language');
    expect(uiBundle).toContain('.alert-empty .empty-actions .primary-btn');
    expect(uiBundle).toContain('保持观察，异常时会在此提示');
    expect(uiBundle).toContain('alert-action');
    expect(uiBundle).toContain('class="alert-item overview-signal ');
    expect(uiBundle).toContain('data-overview-signal-action="alert-focus"');
    expect(uiBundle).toContain('建议排查');
    expect(uiBundle).toContain('.badge.blue');
    expect(uiBundle).toContain('状态分布');
    expect(uiBundle).toContain('链路诊断');
    expect(uiBundle).toContain('告警摘要');
    expect(uiBundle).toContain('冷却处理');
    expect(uiBundle).toContain('ops-strip');
    expect(uiBundle).toContain('workbench-shell');
    expect(uiBundle).toContain('primary-workspace');
    expect(uiBundle).toContain('metrics-compact');
    expect(uiBundle).toContain('keys-panel primary-panel');
    expect(uiBundle).toContain('details-sticky');
    expect(uiBundle).toContain('控制台总览');
    expect(uiBundle).toContain('detail-kpis');
    expect(uiBundle).toContain('cooldown-card');
    expect(uiBundle).toContain('incident-timeline');
    expect(uiBundle).toContain('updateOpsStrip');
    expect(uiBundle).toContain('isOperationalLog');
    expect(uiBundle).not.toContain('class="spark');
    expect(uiBundle).not.toContain('.spark {');
  });
});
