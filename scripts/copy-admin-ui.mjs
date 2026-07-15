import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/admin-ui/', import.meta.url));
const target = fileURLToPath(new URL('../dist/src/admin-ui/', import.meta.url));
const openApiSource = fileURLToPath(new URL('../docs/openapi.json', import.meta.url));
const openApiTarget = fileURLToPath(new URL('../dist/docs/openapi.json', import.meta.url));
const assetNames = [
  'admin.css',
  'admin.js',
  'api.js',
  'state.js',
  'renderKeys.js',
  'renderLogs.js',
  'renderObservability.js',
  'ui/toast.js',
  'ui/busy.js',
  'ui/focus.js',
  'ui/confirm-action.js',
  'ui/table-scroll.js',
  'live/refresh.js',
  'live/events.js',
  'session/auth-ui.js',
  'nav/tabs.js',
  'command/palette.js',
  'logs/actions.js',
  'keys/actions.js',
  'keys/import.js',
  'keys/ops.js',
  'overview/actions.js',
  'console/ops.js',
  'boot/bindings.js',
  'audit/actions.js'
];
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
await mkdir(dirname(openApiTarget), { recursive: true });
await cp(openApiSource, openApiTarget);

function sha256Hex(body) {
  return createHash('sha256').update(body).digest('hex');
}

function resolveImportAssetKey(importerName, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const importerDir = importerName.includes('/') ? importerName.slice(0, importerName.lastIndexOf('/') + 1) : '';
  const parts = (importerDir + specifier).split('/');
  const resolved = [];
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

function transformAssetBody(name, body, hashes) {
  if (!name.endsWith('.js')) return body;
  return body.replace(/from '(\.\.?\/[^']+\.js)'/g, (match, specifier) => {
    const assetKey = resolveImportAssetKey(name, specifier);
    const hash = assetKey ? hashes[assetKey] : undefined;
    return hash ? `from '${specifier}?v=${hash}'` : match;
  });
}

const assets = {};
const sourceBodies = {};
let hashes = {};
for (const name of assetNames) {
  sourceBodies[name] = await readFile(new URL(name, new URL('../dist/src/admin-ui/', import.meta.url)), 'utf8');
  hashes[name] = sha256Hex(sourceBodies[name]).slice(0, 12);
}

let bodies = {};
for (let pass = 0; pass < 8; pass += 1) {
  const nextHashes = {};
  const nextBodies = {};
  for (const name of assetNames) {
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

for (const name of assetNames) {
  const sha256 = sha256Hex(bodies[name]);
  assets[name] = { hash: sha256.slice(0, 12), sha256, path: `/_proxy/ui/${name}` };
}
const version = sha256Hex(
  Object.entries(assets).map(([name, meta]) => `${name}:${meta.sha256}`).sort().join('|')
).slice(0, 12);
await writeFile(
  new URL('../dist/src/admin-ui/asset-manifest.json', import.meta.url),
  `${JSON.stringify({ version, generatedAt: new Date(0).toISOString(), assets }, null, 2)}\n`
);
