import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/admin-ui/', import.meta.url));
const target = fileURLToPath(new URL('../dist/src/admin-ui/', import.meta.url));
const openApiSource = fileURLToPath(new URL('../docs/openapi.json', import.meta.url));
const openApiTarget = fileURLToPath(new URL('../dist/docs/openapi.json', import.meta.url));
const assetNames = ['admin.css', 'admin.js', 'api.js', 'state.js', 'renderKeys.js', 'renderLogs.js', 'renderObservability.js'];
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
await mkdir(dirname(openApiTarget), { recursive: true });
await cp(openApiSource, openApiTarget);

function sha256Hex(body) {
  return createHash('sha256').update(body).digest('hex');
}

function transformAssetBody(name, body, hashes) {
  if (!name.endsWith('.js')) return body;
  return body.replace(/from '(\.\/([^']+\.js))'/g, (match, specifier, fileName) => {
    const hash = hashes[fileName];
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
