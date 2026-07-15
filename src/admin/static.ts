import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ADMIN_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'"
].join('; ');

const assetPaths = new Map<string, { path: URL; type: string }>([
  ['admin.css', { path: new URL('../admin-ui/admin.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/tokens.css', { path: new URL('../admin-ui/css/tokens.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/login.css', { path: new URL('../admin-ui/css/login.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/shell.css', { path: new URL('../admin-ui/css/shell.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/controls.css', { path: new URL('../admin-ui/css/controls.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/overview.css', { path: new URL('../admin-ui/css/overview.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/panels.css', { path: new URL('../admin-ui/css/panels.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/observability.css', { path: new URL('../admin-ui/css/observability.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/details.css', { path: new URL('../admin-ui/css/details.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/modals.css', { path: new URL('../admin-ui/css/modals.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/responsive.css', { path: new URL('../admin-ui/css/responsive.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['css/polish-v2.css', { path: new URL('../admin-ui/css/polish-v2.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['admin.js', { path: new URL('../admin-ui/admin.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['api.js', { path: new URL('../admin-ui/api.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['state.js', { path: new URL('../admin-ui/state.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['renderKeys.js', { path: new URL('../admin-ui/renderKeys.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['renderLogs.js', { path: new URL('../admin-ui/renderLogs.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['renderObservability.js', { path: new URL('../admin-ui/renderObservability.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['ui/toast.js', { path: new URL('../admin-ui/ui/toast.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['ui/busy.js', { path: new URL('../admin-ui/ui/busy.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['ui/focus.js', { path: new URL('../admin-ui/ui/focus.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['ui/confirm-action.js', { path: new URL('../admin-ui/ui/confirm-action.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['ui/table-scroll.js', { path: new URL('../admin-ui/ui/table-scroll.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['live/refresh.js', { path: new URL('../admin-ui/live/refresh.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['live/events.js', { path: new URL('../admin-ui/live/events.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['session/auth-ui.js', { path: new URL('../admin-ui/session/auth-ui.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['nav/tabs.js', { path: new URL('../admin-ui/nav/tabs.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['command/palette.js', { path: new URL('../admin-ui/command/palette.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['logs/actions.js', { path: new URL('../admin-ui/logs/actions.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['logs/render-shared.js', { path: new URL('../admin-ui/logs/render-shared.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['logs/render-list.js', { path: new URL('../admin-ui/logs/render-list.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['logs/render-trace.js', { path: new URL('../admin-ui/logs/render-trace.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['audit/render.js', { path: new URL('../admin-ui/audit/render.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/actions.js', { path: new URL('../admin-ui/keys/actions.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/import.js', { path: new URL('../admin-ui/keys/import.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/ops.js', { path: new URL('../admin-ui/keys/ops.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/render-shared.js', { path: new URL('../admin-ui/keys/render-shared.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/render-summary.js', { path: new URL('../admin-ui/keys/render-summary.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/render-workflow.js', { path: new URL('../admin-ui/keys/render-workflow.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/render-table.js', { path: new URL('../admin-ui/keys/render-table.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['keys/render-details.js', { path: new URL('../admin-ui/keys/render-details.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['overview/actions.js', { path: new URL('../admin-ui/overview/actions.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['overview/render-metrics.js', { path: new URL('../admin-ui/overview/render-metrics.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['overview/render-config.js', { path: new URL('../admin-ui/overview/render-config.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['console/ops.js', { path: new URL('../admin-ui/console/ops.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bindings.js', { path: new URL('../admin-ui/boot/bindings.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-session.js', { path: new URL('../admin-ui/boot/bind-session.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-logs.js', { path: new URL('../admin-ui/boot/bind-logs.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-keys.js', { path: new URL('../admin-ui/boot/bind-keys.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-audit.js', { path: new URL('../admin-ui/boot/bind-audit.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-import.js', { path: new URL('../admin-ui/boot/bind-import.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-command.js', { path: new URL('../admin-ui/boot/bind-command.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['boot/bind-shell.js', { path: new URL('../admin-ui/boot/bind-shell.js', import.meta.url), type: 'application/javascript; charset=utf-8' }],
  ['audit/actions.js', { path: new URL('../admin-ui/audit/actions.js', import.meta.url), type: 'application/javascript; charset=utf-8' }]
]);

const adminUiPath = new URL('../admin-ui/index.html', import.meta.url);
const openApiPath = new URL('../../docs/openapi.json', import.meta.url);

type AssetManifest = {
  version: string;
  generatedAt: string;
  assets: Record<string, { hash: string; sha256: string; path: string }>;
};

type AssetBundle = {
  manifest: AssetManifest;
  bodies: Record<string, string>;
};

let assetBundlePromise: Promise<AssetBundle> | null = null;

function shouldCacheAssets(): boolean {
  return process.env.NODE_ENV === 'production';
}

function withAdminSecurityHeaders(reply: any): any {
  return reply
    .header('content-security-policy', ADMIN_CSP)
    .header('x-content-type-options', 'nosniff')
    .header('referrer-policy', 'no-referrer')
    .header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

async function readAdminUi(): Promise<string> {
  const [html, bundle] = await Promise.all([readFile(adminUiPath, 'utf8'), buildAssetBundle()]);
  const manifest = bundle.manifest;
  let result = html;
  const cssReplaced = result.replace('/_proxy/ui/admin.css"', `/_proxy/ui/admin.css?v=${manifest.assets['admin.css'].hash}"`);
  if (cssReplaced === result) throw new Error('Admin UI build: CSS version injection pattern not found');
  result = cssReplaced;
  const jsReplaced = result.replace('/_proxy/ui/admin.js"', `/_proxy/ui/admin.js?v=${manifest.assets['admin.js'].hash}"`);
  if (jsReplaced === result) throw new Error('Admin UI build: JS version injection pattern not found');
  result = jsReplaced;
  const versionNeedle = 'id="assetVersion" class="top-more-version brand-version" role="status" aria-live="polite" aria-atomic="true" aria-label="控制台版本：待同步。可刷新控制台后查看构建版本">版本 -';
  const versionReplaced = result.replace(
    versionNeedle,
    `id="assetVersion" class="top-more-version brand-version" role="status" aria-live="polite" aria-atomic="true" aria-label="控制台版本：${manifest.version}。可刷新控制台后查看构建版本">版本 ${manifest.version}`
  );
  if (versionReplaced === result) throw new Error('Admin UI build: asset version injection pattern not found — check index.html for attribute changes near #assetVersion');
  return versionReplaced;
}

async function readAsset(name: string): Promise<{ body: string; type: string } | null> {
  const asset = assetPaths.get(name);
  if (!asset) return null;
  const bundle = await buildAssetBundle();
  return { body: bundle.bodies[name], type: asset.type };
}

function sha256Hex(body: string | Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

async function buildAssetBundle(): Promise<AssetBundle> {
  if (shouldCacheAssets() && assetBundlePromise) return assetBundlePromise;
  const bundlePromise = (async () => {
    const sourceBodies: Record<string, string> = {};
    let hashes: Record<string, string> = {};
    for (const [name, asset] of assetPaths.entries()) {
      sourceBodies[name] = await readFile(asset.path, 'utf8');
      hashes[name] = sha256Hex(sourceBodies[name]).slice(0, 12);
    }

    let bodies: Record<string, string> = {};
    for (let pass = 0; pass < 8; pass += 1) {
      const nextHashes: Record<string, string> = {};
      const nextBodies: Record<string, string> = {};
      for (const name of assetPaths.keys()) {
        const body = transformAssetBody(name, sourceBodies[name], hashes);
        const sha256 = sha256Hex(body);
        nextBodies[name] = body;
        nextHashes[name] = sha256.slice(0, 12);
      }
      bodies = nextBodies;
      const changed = Object.keys(nextHashes).some((name) => nextHashes[name] !== hashes[name]);
      hashes = nextHashes;
      if (!changed) break;
    }

    const assets: AssetManifest['assets'] = {};
    for (const name of assetPaths.keys()) {
      const sha256 = sha256Hex(bodies[name]);
      assets[name] = { hash: sha256.slice(0, 12), sha256, path: `/_proxy/ui/${name}` };
    }
    const version = sha256Hex(
      Object.entries(assets).map(([name, meta]) => `${name}:${meta.sha256}`).sort().join('|')
    ).slice(0, 12);
    return {
      manifest: { version, generatedAt: new Date(0).toISOString(), assets },
      bodies
    };
  })();
  if (shouldCacheAssets()) assetBundlePromise = bundlePromise;
  return bundlePromise;
}

async function buildAssetManifest(): Promise<AssetManifest> {
  return (await buildAssetBundle()).manifest;
}

function resolveImportAssetKey(importerName: string, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const importerDir = importerName.includes('/') ? importerName.slice(0, importerName.lastIndexOf('/') + 1) : '';
  const parts = (importerDir + specifier).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolved.length === 0) return null;
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

function transformAssetBody(name: string, body: string, hashes: Record<string, string>): string {
  if (name.endsWith('.js')) {
    return body.replace(/from '(\.\.?\/[^']+\.js)'/g, (match, specifier: string) => {
      const assetKey = resolveImportAssetKey(name, specifier);
      const hash = assetKey ? hashes[assetKey] : undefined;
      return hash ? `from '${specifier}?v=${hash}'` : match;
    });
  }
  if (name.endsWith('.css')) {
    return body.replace(/@import url\("(\.\.?\/[^"]+\.css)"\);/g, (match, specifier: string) => {
      const assetKey = resolveImportAssetKey(name, specifier);
      const hash = assetKey ? hashes[assetKey] : undefined;
      return hash ? `@import url("${specifier}?v=${hash}");` : match;
    });
  }
  return body;
}

function cacheControlForAsset(assetName: string, version: string | undefined, manifest: AssetManifest): string {
  const expected = manifest.assets[assetName]?.hash;
  if (version && expected && expected === version) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

export async function registerAdminStaticRoutes(app: FastifyInstance): Promise<void> {
  const sendAdminUi = async (_request: unknown, reply: any) => withAdminSecurityHeaders(reply)
    .type('text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .send(await readAdminUi());

  app.get('/', sendAdminUi);
  app.get('/favicon.ico', async (_request, reply) => reply.code(204).send());
  app.get('/_proxy/ui', sendAdminUi);
  app.get('/_proxy/ui/asset-manifest.json', async (_request, reply) => withAdminSecurityHeaders(reply)
    .type('application/json; charset=utf-8')
    .header('cache-control', 'no-cache')
    .send(await buildAssetManifest()));
  app.get('/_proxy/openapi.json', async (_request, reply) => withAdminSecurityHeaders(reply)
    .type('application/json; charset=utf-8')
    .header('cache-control', 'no-cache')
    .send(await readFile(openApiPath, 'utf8')));
  app.get('/_proxy/ui/*', async (request, reply) => {
    const assetName = String((request.params as { '*': string })['*'] || '');
    if (!assetName || assetName.includes('..') || assetName.startsWith('/') || assetName.includes('\\')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const query = request.query as { v?: string };
    const manifest = await buildAssetManifest();
    if (query.v && manifest.assets[assetName]?.hash !== query.v) return reply.code(412).send({ error: 'asset_version_mismatch' });
    const asset = await readAsset(assetName);
    if (!asset) return reply.code(404).send({ error: 'not_found' });
    const meta = manifest.assets[assetName];
    const response = withAdminSecurityHeaders(reply)
      .type(asset.type)
      .header('cache-control', cacheControlForAsset(assetName, query.v, manifest));
    if (meta) response.header('etag', `"${meta.hash}"`).header('x-asset-sha256', meta.sha256);
    return response.send(asset.body);
  });
}
