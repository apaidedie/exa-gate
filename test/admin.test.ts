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
    expect(uiSource).toContain('class="ghost-btn secret-toggle"');
    expect(uiSource).toContain('class="ghost-btn session-exit"');
    expect(uiSource).toContain('class="select refresh-interval"');
    expect(uiSource).toContain('.top-actions { flex: none; width: 100%; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-items: stretch; gap: 5px; }');
    expect(uiSource).toContain('.security-group { grid-column: span 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); order: 1; }');
    expect(uiSource).toContain('.refresh-group { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, .92fr) 64px minmax(0, 1fr); order: 3; }');
    expect(uiSource).toContain('.utility-group { grid-column: span 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); order: 2; }');
    expect(uiSource).toContain('.brand { width: 100%; min-width: 0; height: auto; min-height: 32px; }');
    expect(uiSource).toContain('.top-actions .ghost-btn, .top-actions .select, .top-actions label, .refresh-status { min-width: 0; min-height: 32px; padding: 0 6px; font-size: 11px; }');
    expect(uiSource).toContain('.keys-panel .toolbar { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }');
    expect(uiSource).toContain('.keys-panel #keyFilterChips { grid-column: span 3; min-height: 32px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; padding-bottom: 2px; scrollbar-width: thin; }');
    expect(uiSource).toContain('.keys-panel #batchTestPage, .keys-panel #batchDisableProblems, .keys-panel #bulkImportBtn { grid-column: span 2; }');
    expect(uiSource).toContain('.mobile-tabs { display: flex; position: relative; z-index: 2; }');
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
    expect(uiBundle).toContain('auth-card-brand');
    expect(uiBundle).toContain('auth-access-note');
    expect(uiBundle).toContain('auth-demo-guide');
    expect(uiBundle).toContain('本地演示');
    expect(uiBundle).toContain('生产入口');
    expect(uiBundle).toContain('admin_local_token');
    expect(uiBundle).toContain('id="fillDemoToken"');
    expect(uiBundle).toContain('该按钮不会跳过后端校验');
    expect(uiBundle).toContain("loginToken.value = 'admin_local_token'");
    expect(uiBundle).toContain("el('loginButton').focus()");
    expect(uiBundle).toContain('.auth-screen {');
    expect(uiBundle).toContain('place-items: center;');
    expect(uiBundle).not.toContain('place-items: center end');
    expect(uiBundle).toContain('.login-head h1 { margin: 0; color: var(--text); font-size: 25px; line-height: 1.18; font-weight: 720; letter-spacing: 0; }');
    expect(uiBundle).not.toContain('已加密');
    expect(uiBundle).not.toContain('登录前仪表盘');
    expect(uiBundle).not.toContain('auth-dashboard');
    expect(uiBundle).not.toContain('auth-log-table');
    expect(uiBundle).not.toContain('auth-brand');
    expect(uiBundle).not.toContain('Exa API 反向代理</h1>');
    expect(uiBundle).not.toContain('欢迎回来');
    expect(uiBundle).toContain('id="loginToken"');
    expect(uiBundle).toContain('id="loginButton"');
    expect(uiBundle).toContain('auth-key-icon');
    expect(uiBundle).toContain('login-submit-icon');
    expect(uiBundle).toContain('.login-submit-icon::before');
    expect(uiBundle).toContain('nav-icon-collapse');
    expect(uiBundle).toContain("collapseIcon.classList.add('is-collapsed')");
    expect(uiBundle).toContain("collapseIcon.classList.remove('is-collapsed')");
    for (const glyph of ['◇', '↪', '◈', '◐', '▤', '◉', '◁', '▷']) expect(uiBundle).not.toContain(glyph);
    expect(uiBundle).toContain('showLogin');
    expect(uiBundle).toContain('showConsole');
    expect(uiBundle).toContain('/_proxy/health');
    expect(uiBundle).toContain('/_proxy/events');
    expect(uiBundle).not.toContain('once=true');
    expect(uiBundle).toContain('EventSource');
    expect(uiBundle).toContain('refreshInFlight');
    expect(uiBundle).toContain("button.setAttribute('aria-busy', 'true')");
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
    expect(uiBundle).toContain('id="auditTotal"');
    expect(uiBundle).toContain('id="auditSuccess"');
    expect(uiBundle).toContain('id="auditFailure"');
    expect(uiBundle).toContain('id="auditEvidence"');
    expect(uiBundle).toContain('id="auditEvidenceTotal"');
    expect(uiBundle).toContain('id="auditEvidenceFailures"');
    expect(uiBundle).toContain('id="auditEvidenceActor"');
    expect(uiBundle).toContain('id="auditEvidenceExport"');
    expect(uiBundle).toContain('id="governanceHttps"');
    expect(uiBundle).toContain('id="governanceRawKey"');
    expect(uiBundle).toContain('id="governanceRetention"');
    expect(uiBundle).toContain('id="configEvidence"');
    expect(uiBundle).toContain('id="configEvidenceHttps"');
    expect(uiBundle).toContain('id="configEvidenceRawKey"');
    expect(uiBundle).toContain('id="configEvidencePaths"');
    expect(uiBundle).toContain('id="configEvidenceState"');
    expect(uiBundle).toContain('data-mobile-tabs');
    expect(uiBundle).toContain('data-tab-nav');
    expect(uiBundle).toContain('document.querySelectorAll(\'[data-tab-nav]\')');
    expect(uiBundle).toContain('自动刷新');
    expect(uiBundle).toContain('近 24 小时');
    expect(uiBundle).toContain('全部');
    expect(uiBundle).toContain('aria-label="测试当前页密钥"');
    expect(uiBundle).toContain('测试当前页');
    expect(uiBundle).toContain('aria-label="禁用异常密钥"');
    expect(uiBundle).toContain('禁用异常密钥');
    expect(uiBundle).not.toContain('测试选中');
    expect(uiBundle).toContain('密钥详情');
    expect(uiBundle).toContain('移动端密钥详情');
    expect(uiBundle).toContain('detail-body-target');
    expect(uiBundle).toContain('function setDetailBodies');
    expect(uiBundle).toContain('function syncMobileDetailsPanel');
    expect(uiBundle).toContain('mobileDetailsOpen: false');
    expect(uiBundle).toContain('state.mobileDetailsOpen = false');
    expect(uiBundle).toContain("panel.classList.toggle('is-open', Boolean(state.mobileDetailsOpen))");
    expect(uiBundle).toContain("['select', 'copy', 'reset', 'test', 'enable', 'disable'].includes(action)");
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
    expect(uiBundle).toContain('可继续调度');
    expect(uiBundle).toContain('批量操作会写入管理员审计');
    expect(uiBundle).toContain('countEl.innerHTML');
    expect(uiBundle).toContain('当前筛选没有匹配的密钥。清空搜索或状态筛选后再查看详情。');
    expect(uiBundle).toContain('密钥池');
    expect(uiBundle).toContain('请求日志');
    expect(uiBundle).toContain('trace-empty-state idle');
    expect(uiBundle).toContain('log-empty-state');
    expect(uiBundle).toContain('log-empty-cell');
    expect(uiBundle).toContain('trace-empty-steps');
    expect(uiBundle).toContain('function renderLogEmptyState');
    expect(uiBundle).toContain('function logFilterState');
    expect(uiBundle).toContain('function renderLogFilterSummary');
    expect(uiBundle).toContain('function reloadLogs');
    expect(uiBundle).toContain('function clearLogFilters');
    expect(uiBundle).toContain('id="logFilterSummary" class="log-filter-summary is-empty"');
    expect(uiBundle).toContain('id="logFilterChips" class="log-filter-chips"');
    expect(uiBundle).toContain('id="clearLogFilters" class="mini-btn" type="button" data-log-filter-action="clear" hidden');
    expect(uiBundle).toContain('筛选状态');
    expect(uiBundle).toContain('关键词只影响当前表格');
    expect(uiBundle).toContain('log-filter-chip');
    expect(uiBundle).toContain('.log-filter-summary');
    expect(uiBundle).toContain('id="logDiagnostics"');
    expect(uiBundle).toContain('id="logVisibleCount"');
    expect(uiBundle).toContain('id="logErrorCount"');
    expect(uiBundle).toContain('id="logRateLimitCount"');
    expect(uiBundle).toContain('id="logSlowestLatency"');
    expect(uiBundle).toContain('function summarizeLogRows');
    expect(uiBundle).toContain('function renderLogDiagnostics');
    expect(uiBundle).toContain('function summarizeTrace');
    expect(uiBundle).toContain('function renderTraceSummary');
    expect(uiBundle).toContain('trace-summary-grid');
    expect(uiBundle).toContain('密钥链路');
    expect(uiBundle).toContain("el('clearLogFilters').addEventListener('click'");
    expect(uiBundle).toContain('function renderTraceEmptyState');
    expect(uiBundle).toContain('function renderTraceShortcuts');
    expect(uiBundle).toContain('trace-shortcuts');
    expect(uiBundle).toContain('trace-shortcut');
    expect(uiBundle).toContain("panel.className = 'trace-panel is-idle'");
    expect(uiBundle).toContain("panel.className = 'trace-panel ' + (rows.length ? 'is-active' : 'is-missing')");
    expect(uiBundle).toContain('.keys-panel .toolbar { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }');
    expect(uiBundle).toContain('action-group security-group');
    expect(uiBundle).toContain('action-group refresh-group');
    expect(uiBundle).toContain('action-group utility-group');
    expect(uiBundle).toContain('function syncSecretToggleState');
    expect(uiBundle).toContain("button.textContent = showingPlain ? '隐藏原文' : '显示原文'");
    expect(uiBundle).toContain("button.setAttribute('aria-pressed', String(showingPlain))");
    expect(uiBundle).toContain("button.classList.toggle('is-plain', showingPlain)");
    expect(uiBundle).toContain('.top-actions { flex: none; width: 100%; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-items: stretch; gap: 5px; }');
    expect(uiBundle).toContain('.security-group { grid-column: span 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); order: 1; }');
    expect(uiBundle).toContain('.refresh-group { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, .92fr) 64px minmax(0, 1fr); order: 3; }');
    expect(uiBundle).toContain('.utility-group { grid-column: span 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); order: 2; }');
    expect(uiBundle).toContain('.log-tools { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px; }');
    expect(uiBundle).toContain('.trace-panel.is-idle { min-height: 0; padding: 8px 12px; }');
    expect(uiBundle).toContain('.trace-panel.is-idle .trace-empty-state { min-height: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; }');
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
    expect(uiBundle).toContain('没有匹配的密钥。请调整搜索、状态筛选或清空过滤条件。');
    expect(uiBundle).toContain('emptyAction.dataset.emptyAction === \'import\'');
    expect(uiBundle).toContain('id="importPreview" class="import-preview is-empty"');
    expect(uiBundle).toContain('id="importDropzone" class="import-dropzone"');
    expect(uiBundle).toContain('class="import-format-grid"');
    expect(uiBundle).toContain('class="import-dropzone-copy"');
    expect(uiBundle).toContain('class="import-file-name" aria-live="polite"');
    expect(uiBundle).toContain('id="confirmImport" class="primary-btn" type="button" disabled');
    expect(uiBundle).toContain('id="importFileButton" class="ghost-btn file-label" type="button"');
    expect(uiBundle).toContain('id="importFileInput" type="file" accept=".txt,.csv,.json" class="sr-only" tabindex="-1"');
    expect(uiBundle).toContain("el('importFileButton').addEventListener('click'");
    expect(uiBundle).toContain('function isSupportedImportFile');
    expect(uiBundle).toContain('function readImportFile');
    expect(uiBundle).toContain("if (file) readImportFile(file)");
    expect(uiBundle).toContain("el('importDropzone').addEventListener('drop'");
    expect(uiBundle).toContain("showToast('仅支持 .txt、.csv 或 .json 文本文件', 'warn')");
    expect(uiBundle).toContain('JSON 行');
    expect(uiBundle).toContain('{"id":"key_01","value":"..."}');
    expect(uiBundle).toContain('function buildImportPreview');
    expect(uiBundle).toContain('function updateImportPreview');
    expect(uiBundle).toContain('function trapImportFocus');
    expect(uiBundle).toContain('function restoreImportFocus');
    expect(uiBundle).toContain('document.activeElement === last');
    expect(uiBundle).toContain("function showToast(message, tone = 'good')");
    expect(uiBundle).toContain("const safeTone = ['good', 'warn', 'bad'].includes(tone) ? tone : 'good'");
    expect(uiBundle).toContain("toast.className = 'toast ' + safeTone");
    expect(uiBundle).toContain('.toast.good');
    expect(uiBundle).toContain('.toast.warn');
    expect(uiBundle).toContain('.toast.bad');
    expect(uiBundle).toContain('--motion-fast: 140ms;');
    expect(uiBundle).toContain('--motion-medium: 190ms;');
    expect(uiBundle).toContain('--ease-standard: cubic-bezier(.2, .7, .2, 1);');
    expect(uiBundle).toContain('@keyframes tab-panel-enter');
    expect(uiBundle).toContain('@keyframes modal-panel-enter');
    expect(uiBundle).toContain('@keyframes toast-enter');
    expect(uiBundle).toContain('animation: tab-panel-enter var(--motion-medium) var(--ease-standard);');
    expect(uiBundle).toContain('.modal-overlay.modal-open { display: flex; animation: modal-overlay-enter var(--motion-fast) ease-out; }');
    expect(uiBundle).toContain('.modal-overlay.modal-open .modal { animation: modal-panel-enter var(--motion-medium) var(--ease-standard); }');
    expect(uiBundle).toContain('animation: toast-enter var(--motion-fast) var(--ease-standard);');
    expect(uiBundle).toContain('@media (prefers-reduced-motion: reduce)');
    expect(uiBundle).toContain("showToast('Webhook 测试失败：' + (error.message || '未知错误'), 'bad')");
    expect(uiBundle).toContain("showToast('没有可批量处理的密钥', 'warn')");
    expect(uiBundle).toContain('JSON 格式无法解析');
    expect(uiBundle).toContain('重复密钥已跳过');
    expect(uiBundle).toContain('重复 ID 已跳过');
    expect(uiBundle).toContain('preview.keys.length === 0');
    expect(uiBundle).toContain('.import-preview.has-warnings');
    expect(uiBundle).toContain('.import-stats');
    expect(uiBundle).toContain('displayLabel');
    expect(uiBundle).toContain('测试密钥');
    expect(uiBundle).toContain('操作反馈');
    expect(uiBundle).toContain('重置冷却');
    expect(uiBundle).toContain('禁用密钥');
    expect(uiBundle).toContain('上游超时');
    expect(uiBundle).toContain('连接异常');
    expect(uiBundle).toContain('临时错误');
    expect(uiBundle).not.toContain('添加密钥');
    expect(uiBundle).toContain('筛选</button>');
    expect(uiBundle).toContain('趋势视图');
    expect(uiBundle).toContain('告警中心');
    expect(uiBundle).toContain('管理员审计');
    expect(uiBundle).toContain('function renderAuditSummary');
    expect(uiBundle).toContain('function renderAuditEvidence');
    expect(uiBundle).toContain('function renderAuditEmptyState');
    expect(uiBundle).toContain('audit-meta-grid');
    expect(uiBundle).toContain('audit-detail');
    expect(uiBundle).toContain('function auditActionLabel');
    expect(uiBundle).toContain('管理员登录');
    expect(uiBundle).toContain('批量禁用密钥');
    expect(uiBundle).toContain('测试告警 Webhook');
    expect(uiBundle).toContain('自动清理过期日志');
    expect(uiBundle).toContain('class="audit-action-code"');
    expect(uiBundle).toContain('.audit-action-code');
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
    expect(uiBundle).not.toContain('switchView');
    expect(uiBundle).toContain('运行配置');
    expect(uiBundle).toContain('function setEvidenceCell');
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
    expect(uiBundle).toContain('id="prevKeyPage"');
    expect(uiBundle).toContain('id="nextKeyPage"');
    expect(uiBundle).toContain("data-action=\"test\"");
    expect(uiBundle).toContain("'/test'");
    expect(uiBundle).not.toContain('.metric-meter-fill.green { width:');
    expect(uiBundle).not.toContain('.metric-meter-fill.amber { width:');
    expect(uiBundle).not.toContain('.metric-meter-fill.red { width:');
    expect(uiBundle).toContain('运行态势');
    expect(uiBundle).toContain('运行洞察');
    expect(uiBundle).toContain('insight-band');
    expect(uiBundle).toContain('id="insightJudgement"');
    expect(uiBundle).toContain('id="insightNextAction"');
    expect(uiBundle).toContain('id="insightWindow"');
    expect(uiBundle).toContain('当前判断');
    expect(uiBundle).toContain('观测窗口');
    expect(uiBundle).toContain('function setInsightCard');
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
    expect(uiBundle).toContain('alert-empty');
    expect(uiBundle).toContain('alert-action');
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
