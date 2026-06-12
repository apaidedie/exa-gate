# Exa Reverse Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Docker-deployable Exa-compatible reverse proxy that hides multiple upstream Exa keys, balances traffic across them, fails over on rate limits/timeouts/transient errors, tracks per-key health, and exposes sanitized admin observability.

**Architecture:** Implement a single Fastify service in TypeScript. The proxy keeps request/response schemas transparent, injects selected upstream Exa keys at the edge, stores key health and resource affinity in SQLite, and uses a fake upstream for deterministic tests.

**Tech Stack:** Node.js 22, TypeScript, Fastify, Undici, better-sqlite3, Vitest, Docker multi-stage build, Docker Compose.

---

## Source Design

Primary spec: `docs/superpowers/specs/2026-06-08-exa-reverse-proxy-design.md`

Implementation defaults from the spec:

* Listen on `0.0.0.0:8787`.
* Default Exa upstream is `https://api.exa.ai`.
* Downstream clients use proxy-owned auth tokens.
* Upstream Exa keys are injected as `x-api-key` and never returned or logged.
* Default key selection is weighted round-robin.
* Default state backend is SQLite.
* Admin endpoints live under `/_proxy/*`.
* Docker deployment is required.

## File Structure

Create these files:

```text
.
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src
│   ├── admin.ts
│   ├── app.ts
│   ├── auth.ts
│   ├── config.ts
│   ├── errors.ts
│   ├── headers.ts
│   ├── index.ts
│   ├── metrics.ts
│   ├── proxy.ts
│   ├── retry.ts
│   ├── routes.ts
│   ├── scheduler.ts
│   ├── state.ts
│   ├── upstream.ts
│   └── util
│       ├── clock.ts
│       └── redact.ts
├── test
│   ├── app.test.ts
│   ├── auth.test.ts
│   ├── config.test.ts
│   ├── headers.test.ts
│   ├── proxy.failover.test.ts
│   ├── proxy.streaming.test.ts
│   ├── retry.test.ts
│   ├── routes.test.ts
│   ├── scheduler.test.ts
│   ├── state.test.ts
│   └── helpers
│       └── fakeExa.ts
└── README.md
```

Responsibilities:

* `src/index.ts`: process entrypoint, loads config, opens state, starts server.
* `src/app.ts`: builds Fastify instance and registers admin/proxy routes.
* `src/config.ts`: reads environment variables, parses keys/tokens, validates defaults.
* `src/auth.ts`: constant-time proxy token validation and admin token validation.
* `src/routes.ts`: route allowlist, retry safety by method/path, resource affinity path parsing.
* `src/headers.ts`: strips downstream auth/hop-by-hop headers and injects upstream auth.
* `src/scheduler.ts`: key registry, health eligibility, round-robin, weighted round-robin, least-recently-used.
* `src/retry.ts`: retry classification, timeout classification, backoff calculation.
* `src/state.ts`: SQLite schema and data access for key metrics, cooldowns, and resource affinity.
* `src/upstream.ts`: Undici request wrapper that supports normal and streaming responses.
* `src/proxy.ts`: main Exa-compatible reverse proxy handler.
* `src/admin.ts`: sanitized `/_proxy/*` endpoints.
* `src/metrics.ts`: JSON and Prometheus-style metric rendering.
* `src/errors.ts`: stable proxy-owned error responses.
* `src/util/redact.ts`: secret redaction helpers.
* `test/helpers/fakeExa.ts`: fake upstream server for deterministic integration tests.

## Environment Contract

Use these environment variables in the first version:

```text
PORT=8787
HOST=0.0.0.0
EXA_UPSTREAM_URL=https://api.exa.ai
EXA_KEYS=exa_a:${EXA_KEY_A}:1,exa_b:${EXA_KEY_B}:2
EXA_PROXY_TOKENS=client_local_token
EXA_ADMIN_TOKENS=admin_local_token
EXA_STATE_PATH=/data/exa-proxy.sqlite
EXA_SELECTION_STRATEGY=weighted_round_robin
EXA_MAX_ATTEMPTS=3
EXA_ATTEMPT_TIMEOUT_MS=30000
EXA_RETRY_BACKOFF_MS=200,600,1500
EXA_FAILURE_THRESHOLD=3
EXA_FAILURE_WINDOW_SECONDS=60
EXA_COOLDOWN_SECONDS=120
EXA_RATE_LIMIT_COOLDOWN_SECONDS=300
EXA_MAX_BODY_BYTES=20971520
EXA_ALLOWED_PATHS=/**
EXA_RESOURCE_AFFINITY=true
LOG_LEVEL=info
```

`EXA_KEYS` uses `id:key:weight` entries separated by commas. The parser must also accept direct literal values for local testing. The `.env.example` file must show the syntax with sample values only.

## Git Note

This workspace is currently not a git repository. Commit steps are included so the plan can be executed unchanged inside a repository later. When executing in the current non-git workspace, skip the commit step at the end of each task and continue to the next task after verification passes.

## Task 1: Project Skeleton and Tooling

**Files:**
* Create: `package.json`
* Create: `tsconfig.json`
* Create: `vitest.config.ts`
* Create: `.gitignore`
* Create: `.env.example`
* Create: `src/index.ts`
* Create: `src/app.ts`
* Create: `test/app.test.ts`

- [ ] **Step 1: Create the package and TypeScript config**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "exa-reverse-proxy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@fastify/sensible": "^6.0.3",
    "better-sqlite3": "^11.10.0",
    "fastify": "^5.3.3",
    "undici": "^7.10.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.15.29",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.2.1"
  },
  "engines": {
    "node": ">=22"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    restoreMocks: true,
    testTimeout: 10000
  }
});
```

- [ ] **Step 2: Create ignore and example env files**

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
*.sqlite
*.sqlite-shm
*.sqlite-wal
npm-debug.log*
```

Create `.env.example`:

```dotenv
PORT=8787
HOST=0.0.0.0
EXA_UPSTREAM_URL=https://api.exa.ai
EXA_KEYS=exa_a:replace_with_exa_key_a:1,exa_b:replace_with_exa_key_b:1
EXA_PROXY_TOKENS=replace_with_client_token
EXA_ADMIN_TOKENS=replace_with_admin_token
EXA_STATE_PATH=/data/exa-proxy.sqlite
EXA_SELECTION_STRATEGY=weighted_round_robin
EXA_MAX_ATTEMPTS=3
EXA_ATTEMPT_TIMEOUT_MS=30000
EXA_RETRY_BACKOFF_MS=200,600,1500
EXA_FAILURE_THRESHOLD=3
EXA_FAILURE_WINDOW_SECONDS=60
EXA_COOLDOWN_SECONDS=120
EXA_RATE_LIMIT_COOLDOWN_SECONDS=300
EXA_MAX_BODY_BYTES=20971520
EXA_ALLOWED_PATHS=/**
EXA_RESOURCE_AFFINITY=true
LOG_LEVEL=info
```

- [ ] **Step 3: Write the initial failing app test**

Create `test/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('app', () => {
  it('returns service health', async () => {
    const app = await buildApp({
      config: {
        host: '127.0.0.1',
        port: 0,
        upstreamUrl: 'https://api.exa.ai',
        keys: [],
        proxyTokens: ['client_token'],
        adminTokens: ['admin_token'],
        statePath: ':memory:',
        selectionStrategy: 'weighted_round_robin',
        maxAttempts: 3,
        attemptTimeoutMs: 30000,
        retryBackoffMs: [200, 600, 1500],
        failureThreshold: 3,
        failureWindowSeconds: 60,
        cooldownSeconds: 120,
        rateLimitCooldownSeconds: 300,
        maxBodyBytes: 20971520,
        allowedPaths: ['/**'],
        resourceAffinity: true,
        logLevel: 'silent'
      }
    });

    const response = await app.inject({ method: 'GET', url: '/_proxy/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
    await app.close();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm install && npm test -- test/app.test.ts`

Expected: FAIL because `src/app.ts` does not exist.

- [ ] **Step 5: Implement minimal app and entrypoint**

Create `src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify';

export type ProxyConfig = {
  host: string;
  port: number;
  upstreamUrl: string;
  keys: Array<{ id: string; value: string; weight: number; enabled: boolean }>;
  proxyTokens: string[];
  adminTokens: string[];
  statePath: string;
  selectionStrategy: 'round_robin' | 'weighted_round_robin' | 'least_recently_used';
  maxAttempts: number;
  attemptTimeoutMs: number;
  retryBackoffMs: number[];
  failureThreshold: number;
  failureWindowSeconds: number;
  cooldownSeconds: number;
  rateLimitCooldownSeconds: number;
  maxBodyBytes: number;
  allowedPaths: string[];
  resourceAffinity: boolean;
  logLevel: string;
};

export async function buildApp(options: { config: ProxyConfig }): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.config.logLevel === 'silent' ? false : { level: options.config.logLevel } });

  app.get('/_proxy/health', async () => ({ ok: true, keys: options.config.keys.length }));

  return app;
}
```

Create `src/index.ts`:

```ts
import { buildApp, type ProxyConfig } from './app.js';

const config: ProxyConfig = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  upstreamUrl: process.env.EXA_UPSTREAM_URL ?? 'https://api.exa.ai',
  keys: [],
  proxyTokens: (process.env.EXA_PROXY_TOKENS ?? '').split(',').filter(Boolean),
  adminTokens: (process.env.EXA_ADMIN_TOKENS ?? '').split(',').filter(Boolean),
  statePath: process.env.EXA_STATE_PATH ?? './exa-proxy.sqlite',
  selectionStrategy: 'weighted_round_robin',
  maxAttempts: Number(process.env.EXA_MAX_ATTEMPTS ?? 3),
  attemptTimeoutMs: Number(process.env.EXA_ATTEMPT_TIMEOUT_MS ?? 30000),
  retryBackoffMs: [200, 600, 1500],
  failureThreshold: Number(process.env.EXA_FAILURE_THRESHOLD ?? 3),
  failureWindowSeconds: Number(process.env.EXA_FAILURE_WINDOW_SECONDS ?? 60),
  cooldownSeconds: Number(process.env.EXA_COOLDOWN_SECONDS ?? 120),
  rateLimitCooldownSeconds: Number(process.env.EXA_RATE_LIMIT_COOLDOWN_SECONDS ?? 300),
  maxBodyBytes: Number(process.env.EXA_MAX_BODY_BYTES ?? 20971520),
  allowedPaths: ['/**'],
  resourceAffinity: process.env.EXA_RESOURCE_AFFINITY !== 'false',
  logLevel: process.env.LOG_LEVEL ?? 'info'
};

const app = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });
```

- [ ] **Step 6: Run test and typecheck**

Run: `npm test -- test/app.test.ts && npm run build`

Expected: PASS and TypeScript build succeeds.

- [ ] **Step 7: Commit**

Run only if the directory is a git repository:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example src/index.ts src/app.ts test/app.test.ts
git commit -m "chore: scaffold exa reverse proxy service"
```

## Task 2: Configuration Parser

**Files:**
* Create: `src/config.ts`
* Modify: `src/index.ts`
* Modify: `src/app.ts`
* Create: `test/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfigFromEnv } from '../src/config.js';

describe('loadConfigFromEnv', () => {
  it('parses keys, weights, tokens, and numeric defaults', () => {
    const config = loadConfigFromEnv({
      EXA_KEYS: 'exa_a:key-a:1,exa_b:key-b:2',
      EXA_PROXY_TOKENS: 'client-a,client-b',
      EXA_ADMIN_TOKENS: 'admin-a',
      EXA_RETRY_BACKOFF_MS: '100,250',
      EXA_ALLOWED_PATHS: '/search,/contents,/v0/**'
    });

    expect(config.keys).toEqual([
      { id: 'exa_a', value: 'key-a', weight: 1, enabled: true },
      { id: 'exa_b', value: 'key-b', weight: 2, enabled: true }
    ]);
    expect(config.proxyTokens).toEqual(['client-a', 'client-b']);
    expect(config.adminTokens).toEqual(['admin-a']);
    expect(config.retryBackoffMs).toEqual([100, 250]);
    expect(config.allowedPaths).toEqual(['/search', '/contents', '/v0/**']);
    expect(config.port).toBe(8787);
    expect(config.selectionStrategy).toBe('weighted_round_robin');
  });

  it('rejects missing proxy tokens', () => {
    expect(() => loadConfigFromEnv({ EXA_KEYS: 'exa_a:key-a:1' })).toThrow('EXA_PROXY_TOKENS is required');
  });

  it('rejects invalid key entries', () => {
    expect(() => loadConfigFromEnv({ EXA_KEYS: 'broken', EXA_PROXY_TOKENS: 'client' })).toThrow('Invalid EXA_KEYS entry');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/config.test.ts`

Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 3: Implement config parser**

Create `src/config.ts`:

```ts
import type { ProxyConfig } from './app.js';

type Env = Record<string, string | undefined>;

function splitCsv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function readNumber(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`);
  return parsed;
}

function parseKeys(raw: string | undefined): ProxyConfig['keys'] {
  return splitCsv(raw).map((entry) => {
    const parts = entry.split(':');
    if (parts.length !== 3) throw new Error(`Invalid EXA_KEYS entry: ${entry}`);
    const [id, value, weightRaw] = parts;
    const weight = Number(weightRaw);
    if (!id || !value || !Number.isInteger(weight) || weight < 1) throw new Error(`Invalid EXA_KEYS entry: ${entry}`);
    return { id, value, weight, enabled: true };
  });
}

function parseStrategy(raw: string | undefined): ProxyConfig['selectionStrategy'] {
  if (!raw) return 'weighted_round_robin';
  if (raw === 'round_robin' || raw === 'weighted_round_robin' || raw === 'least_recently_used') return raw;
  throw new Error(`Invalid EXA_SELECTION_STRATEGY: ${raw}`);
}

export function loadConfigFromEnv(env: Env = process.env): ProxyConfig {
  const proxyTokens = splitCsv(env.EXA_PROXY_TOKENS);
  if (proxyTokens.length === 0) throw new Error('EXA_PROXY_TOKENS is required');

  return {
    host: env.HOST ?? '0.0.0.0',
    port: readNumber(env, 'PORT', 8787),
    upstreamUrl: env.EXA_UPSTREAM_URL ?? 'https://api.exa.ai',
    keys: parseKeys(env.EXA_KEYS),
    proxyTokens,
    adminTokens: splitCsv(env.EXA_ADMIN_TOKENS),
    statePath: env.EXA_STATE_PATH ?? './exa-proxy.sqlite',
    selectionStrategy: parseStrategy(env.EXA_SELECTION_STRATEGY),
    maxAttempts: readNumber(env, 'EXA_MAX_ATTEMPTS', 3),
    attemptTimeoutMs: readNumber(env, 'EXA_ATTEMPT_TIMEOUT_MS', 30000),
    retryBackoffMs: splitCsv(env.EXA_RETRY_BACKOFF_MS).map(Number).filter(Number.isFinite).length > 0
      ? splitCsv(env.EXA_RETRY_BACKOFF_MS).map(Number)
      : [200, 600, 1500],
    failureThreshold: readNumber(env, 'EXA_FAILURE_THRESHOLD', 3),
    failureWindowSeconds: readNumber(env, 'EXA_FAILURE_WINDOW_SECONDS', 60),
    cooldownSeconds: readNumber(env, 'EXA_COOLDOWN_SECONDS', 120),
    rateLimitCooldownSeconds: readNumber(env, 'EXA_RATE_LIMIT_COOLDOWN_SECONDS', 300),
    maxBodyBytes: readNumber(env, 'EXA_MAX_BODY_BYTES', 20971520),
    allowedPaths: splitCsv(env.EXA_ALLOWED_PATHS).length > 0 ? splitCsv(env.EXA_ALLOWED_PATHS) : ['/**'],
    resourceAffinity: env.EXA_RESOURCE_AFFINITY !== 'false',
    logLevel: env.LOG_LEVEL ?? 'info'
  };
}
```

- [ ] **Step 4: Wire config into entrypoint**

Replace `src/index.ts` with:

```ts
import { buildApp } from './app.js';
import { loadConfigFromEnv } from './config.js';

const config = loadConfigFromEnv();
const app = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });
```

- [ ] **Step 5: Run tests and build**

Run: `npm test -- test/config.test.ts test/app.test.ts && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/index.ts test/config.test.ts src/app.ts
git commit -m "feat: add proxy configuration parser"
```

## Task 3: Authentication and Secret Redaction

**Files:**
* Create: `src/auth.ts`
* Create: `src/util/redact.ts`
* Modify: `src/app.ts`
* Create: `test/auth.test.ts`

- [ ] **Step 1: Write failing auth tests**

Create `test/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAuthorized, tokenId } from '../src/auth.js';
import { redactSecrets } from '../src/util/redact.js';

describe('auth', () => {
  it('accepts bearer and x-proxy-api-key tokens', () => {
    expect(isAuthorized({ authorization: 'Bearer client_token' }, ['client_token'])).toBe(true);
    expect(isAuthorized({ 'x-proxy-api-key': 'client_token' }, ['client_token'])).toBe(true);
  });

  it('rejects missing or incorrect tokens', () => {
    expect(isAuthorized({}, ['client_token'])).toBe(false);
    expect(isAuthorized({ authorization: 'Bearer wrong' }, ['client_token'])).toBe(false);
  });

  it('creates stable non-secret token ids', () => {
    expect(tokenId('client_token')).toMatch(/^tok_[a-f0-9]{12}$/);
    expect(tokenId('client_token')).toBe(tokenId('client_token'));
  });
});

describe('redactSecrets', () => {
  it('redacts configured secret strings', () => {
    expect(redactSecrets('key-a and client_token', ['key-a', 'client_token'])).toBe('[REDACTED] and [REDACTED]');
  });
});
```

- [ ] **Step 2: Run auth tests to verify failure**

Run: `npm test -- test/auth.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement auth helpers**

Create `src/auth.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';

type HeaderBag = Record<string, string | string[] | undefined>;

function extractToken(headers: HeaderBag): string | undefined {
  const bearer = headers.authorization;
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) return bearer.slice('Bearer '.length).trim();
  const proxyKey = headers['x-proxy-api-key'];
  if (typeof proxyKey === 'string') return proxyKey.trim();
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isAuthorized(headers: HeaderBag, allowedTokens: string[]): boolean {
  const presented = extractToken(headers);
  if (!presented) return false;
  return allowedTokens.some((token) => safeEqual(presented, token));
}

export function presentedTokenId(headers: HeaderBag, allowedTokens: string[]): string | undefined {
  const presented = extractToken(headers);
  if (!presented) return undefined;
  const matched = allowedTokens.find((token) => safeEqual(presented, token));
  return matched ? tokenId(matched) : undefined;
}

export function tokenId(token: string): string {
  return `tok_${createHash('sha256').update(token).digest('hex').slice(0, 12)}`;
}
```

Create `src/util/redact.ts`:

```ts
export function redactSecrets(input: string, secrets: string[]): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce((text, secret) => text.split(secret).join('[REDACTED]'), input);
}
```

- [ ] **Step 4: Protect admin health endpoint**

Update `src/app.ts` so `/_proxy/health` requires admin auth:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { isAuthorized } from './auth.js';

export type ProxyConfig = {
  host: string;
  port: number;
  upstreamUrl: string;
  keys: Array<{ id: string; value: string; weight: number; enabled: boolean }>;
  proxyTokens: string[];
  adminTokens: string[];
  statePath: string;
  selectionStrategy: 'round_robin' | 'weighted_round_robin' | 'least_recently_used';
  maxAttempts: number;
  attemptTimeoutMs: number;
  retryBackoffMs: number[];
  failureThreshold: number;
  failureWindowSeconds: number;
  cooldownSeconds: number;
  rateLimitCooldownSeconds: number;
  maxBodyBytes: number;
  allowedPaths: string[];
  resourceAffinity: boolean;
  logLevel: string;
};

export async function buildApp(options: { config: ProxyConfig }): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.config.logLevel === 'silent' ? false : { level: options.config.logLevel } });

  app.get('/_proxy/health', async (request, reply) => {
    if (!isAuthorized(request.headers, options.config.adminTokens)) {
      return reply.code(401).send({ error: { type: 'proxy_error', code: 'unauthorized', message: 'Unauthorized' } });
    }
    return { ok: true, keys: options.config.keys.length };
  });

  return app;
}
```

Update `test/app.test.ts` request to include admin auth:

```ts
const response = await app.inject({
  method: 'GET',
  url: '/_proxy/health',
  headers: { authorization: 'Bearer admin_token' }
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- test/auth.test.ts test/app.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts src/util/redact.ts src/app.ts test/auth.test.ts test/app.test.ts
git commit -m "feat: add proxy authentication and redaction helpers"
```

## Task 4: Route Policy and Header Sanitization

**Files:**
* Create: `src/routes.ts`
* Create: `src/headers.ts`
* Create: `test/routes.test.ts`
* Create: `test/headers.test.ts`

- [ ] **Step 1: Write failing route and header tests**

Create `test/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isPathAllowed, isRetrySafe, parseResourceAffinity } from '../src/routes.js';

describe('route policy', () => {
  it('matches exact and wildcard allowed paths', () => {
    expect(isPathAllowed('/search', ['/search'])).toBe(true);
    expect(isPathAllowed('/v0/websets/abc', ['/v0/**'])).toBe(true);
    expect(isPathAllowed('/admin', ['/search'])).toBe(false);
  });

  it('classifies safe retry methods and selected search endpoints', () => {
    expect(isRetrySafe('GET', '/v0/teams/me', {})).toBe(true);
    expect(isRetrySafe('POST', '/search', {})).toBe(true);
    expect(isRetrySafe('POST', '/agent/runs', {})).toBe(false);
    expect(isRetrySafe('POST', '/agent/runs', { 'idempotency-key': 'abc' })).toBe(true);
  });

  it('parses known resource ids from paths', () => {
    expect(parseResourceAffinity('/agent/runs/run_123')).toEqual({ resourceType: 'agent_run', resourceId: 'run_123' });
    expect(parseResourceAffinity('/research/v1/res_123')).toEqual({ resourceType: 'research', resourceId: 'res_123' });
    expect(parseResourceAffinity('/search')).toBeUndefined();
  });
});
```

Create `test/headers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildUpstreamHeaders, sanitizeResponseHeaders } from '../src/headers.js';

describe('headers', () => {
  it('strips downstream secrets and injects upstream key', () => {
    const headers = buildUpstreamHeaders({
      authorization: 'Bearer client',
      'x-api-key': 'downstream-key',
      'content-type': 'application/json',
      connection: 'keep-alive'
    }, 'upstream-key');

    expect(headers.authorization).toBeUndefined();
    expect(headers['x-api-key']).toBe('upstream-key');
    expect(headers['content-type']).toBe('application/json');
    expect(headers.connection).toBeUndefined();
  });

  it('strips hop-by-hop response headers', () => {
    const headers = sanitizeResponseHeaders({ connection: 'close', 'content-type': 'application/json' });
    expect(headers.connection).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/routes.test.ts test/headers.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement route policy**

Create `src/routes.ts`:

```ts
type HeaderBag = Record<string, string | string[] | undefined>;

export function isPathAllowed(pathname: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((pattern) => {
    if (pattern === '/**') return pathname.startsWith('/');
    if (pattern.endsWith('/**')) return pathname.startsWith(pattern.slice(0, -3));
    return pathname === pattern;
  });
}

export function isRetrySafe(method: string, pathname: string, headers: HeaderBag): boolean {
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return true;
  if (upper === 'POST' && ['/search', '/contents', '/answer'].includes(pathname)) return true;
  return typeof headers['idempotency-key'] === 'string' || typeof headers['Idempotency-Key'] === 'string';
}

export function parseResourceAffinity(pathname: string): { resourceType: string; resourceId: string } | undefined {
  const patterns: Array<[RegExp, string]> = [
    [/^\/agent\/runs\/([^/]+)/, 'agent_run'],
    [/^\/research\/v1\/([^/]+)/, 'research'],
    [/^\/monitors\/([^/]+)/, 'monitor'],
    [/^\/v0\/websets\/([^/]+)/, 'webset'],
    [/^\/v0\/webhooks\/([^/]+)/, 'webhook'],
    [/^\/v0\/imports\/([^/]+)/, 'import']
  ];
  for (const [regex, resourceType] of patterns) {
    const match = pathname.match(regex);
    if (match) return { resourceType, resourceId: match[1] };
  }
  return undefined;
}
```

- [ ] **Step 4: Implement header utilities**

Create `src/headers.ts`:

```ts
const HOP_BY_HOP = new Set([
  'connection',
  'transfer-encoding',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'upgrade'
]);

type HeaderValue = string | string[] | number | undefined;
type HeaderBag = Record<string, HeaderValue>;

function setHeader(target: Record<string, string>, name: string, value: HeaderValue): void {
  if (value === undefined) return;
  target[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
}

export function buildUpstreamHeaders(source: HeaderBag, upstreamKey: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === 'authorization' || lower === 'x-api-key' || lower === 'x-proxy-api-key') continue;
    setHeader(result, lower, value);
  }
  result['x-api-key'] = upstreamKey;
  return result;
}

export function sanitizeResponseHeaders(source: HeaderBag): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    setHeader(result, lower, value);
  }
  return result;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- test/routes.test.ts test/headers.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes.ts src/headers.ts test/routes.test.ts test/headers.test.ts
git commit -m "feat: add route policy and header sanitization"
```

## Task 5: Scheduler and Circuit State Model

**Files:**
* Create: `src/scheduler.ts`
* Create: `src/util/clock.ts`
* Create: `test/scheduler.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

Create `test/scheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KeyScheduler } from '../src/scheduler.js';

const keys = [
  { id: 'a', value: 'key-a', weight: 1, enabled: true },
  { id: 'b', value: 'key-b', weight: 2, enabled: true }
];

describe('KeyScheduler', () => {
  it('performs weighted round robin over healthy keys', () => {
    const scheduler = new KeyScheduler({ keys, strategy: 'weighted_round_robin' });
    expect([scheduler.next()?.id, scheduler.next()?.id, scheduler.next()?.id, scheduler.next()?.id]).toEqual(['a', 'b', 'b', 'a']);
  });

  it('skips cooling down keys', () => {
    const scheduler = new KeyScheduler({ keys, strategy: 'round_robin' });
    scheduler.coolDown('a', 1000, 0, 'rate_limit');
    expect(scheduler.next(10)?.id).toBe('b');
  });

  it('returns undefined when no key is eligible', () => {
    const scheduler = new KeyScheduler({ keys, strategy: 'round_robin' });
    scheduler.coolDown('a', 1000, 0, 'rate_limit');
    scheduler.coolDown('b', 1000, 0, 'rate_limit');
    expect(scheduler.next(10)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/scheduler.test.ts`

Expected: FAIL because scheduler does not exist.

- [ ] **Step 3: Implement scheduler**

Create `src/util/clock.ts`:

```ts
export type Clock = { now(): number };

export const systemClock: Clock = {
  now: () => Date.now()
};
```

Create `src/scheduler.ts`:

```ts
export type ExaKey = { id: string; value: string; weight: number; enabled: boolean };
export type KeyState = {
  key: ExaKey;
  cooldownUntil: number;
  disabled: boolean;
  lastUsedAt: number;
  lastReason?: string;
};

type Strategy = 'round_robin' | 'weighted_round_robin' | 'least_recently_used';

export class KeyScheduler {
  private states = new Map<string, KeyState>();
  private sequence: string[];
  private index = 0;

  constructor(options: { keys: ExaKey[]; strategy: Strategy }) {
    for (const key of options.keys) {
      this.states.set(key.id, { key, cooldownUntil: 0, disabled: !key.enabled, lastUsedAt: 0 });
    }
    this.sequence = this.buildSequence(options.keys, options.strategy);
  }

  next(now = Date.now(), excluded = new Set<string>()): ExaKey | undefined {
    const eligible = [...this.states.values()].filter((state) => this.isEligible(state, now, excluded));
    if (eligible.length === 0) return undefined;
    for (let attempt = 0; attempt < this.sequence.length; attempt += 1) {
      const id = this.sequence[this.index % this.sequence.length];
      this.index += 1;
      const state = this.states.get(id);
      if (state && this.isEligible(state, now, excluded)) {
        state.lastUsedAt = now;
        return state.key;
      }
    }
    const leastRecent = eligible.sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    leastRecent.lastUsedAt = now;
    return leastRecent.key;
  }

  coolDown(keyId: string, durationMs: number, now = Date.now(), reason = 'cooldown'): void {
    const state = this.states.get(keyId);
    if (!state) return;
    state.cooldownUntil = now + durationMs;
    state.lastReason = reason;
  }

  setDisabled(keyId: string, disabled: boolean): void {
    const state = this.states.get(keyId);
    if (state) state.disabled = disabled;
  }

  snapshot(now = Date.now()): Array<Omit<KeyState, 'key'> & { id: string; weight: number; healthy: boolean }> {
    return [...this.states.values()].map((state) => ({
      id: state.key.id,
      weight: state.key.weight,
      cooldownUntil: state.cooldownUntil,
      disabled: state.disabled,
      lastUsedAt: state.lastUsedAt,
      lastReason: state.lastReason,
      healthy: this.isEligible(state, now, new Set())
    }));
  }

  private isEligible(state: KeyState, now: number, excluded: Set<string>): boolean {
    return state.key.enabled && !state.disabled && state.cooldownUntil <= now && !excluded.has(state.key.id);
  }

  private buildSequence(keys: ExaKey[], strategy: Strategy): string[] {
    if (strategy === 'round_robin' || strategy === 'least_recently_used') return keys.map((key) => key.id);
    return keys.flatMap((key) => Array.from({ length: key.weight }, () => key.id));
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/scheduler.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.ts src/util/clock.ts test/scheduler.test.ts
git commit -m "feat: add key scheduler"
```

## Task 6: SQLite State Store

**Files:**
* Create: `src/state.ts`
* Create: `test/state.test.ts`

- [ ] **Step 1: Write failing state tests**

Create `test/state.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { StateStore } from '../src/state.js';

let store: StateStore | undefined;

afterEach(() => store?.close());

describe('StateStore', () => {
  it('records attempts and exposes sanitized key stats', () => {
    store = new StateStore(':memory:');
    store.ensureKeys([{ id: 'a', value: 'secret-a', weight: 1, enabled: true }]);
    store.recordAttempt({ keyId: 'a', statusCode: 200, latencyMs: 15, retry: false, errorCode: undefined });
    expect(store.listKeyStats()).toMatchObject([{ id: 'a', totalRequests: 1, successCount: 1, failureCount: 0 }]);
    expect(JSON.stringify(store.listKeyStats())).not.toContain('secret-a');
  });

  it('stores and reads resource affinity', () => {
    store = new StateStore(':memory:');
    store.setResourceAffinity('agent_run', 'run_123', 'a');
    expect(store.getResourceAffinity('agent_run', 'run_123')).toBe('a');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/state.test.ts`

Expected: FAIL because state store does not exist.

- [ ] **Step 3: Implement SQLite store**

Create `src/state.ts`:

```ts
import Database from 'better-sqlite3';
import type { ExaKey } from './scheduler.js';

export type AttemptRecord = {
  keyId: string;
  statusCode?: number;
  latencyMs: number;
  retry: boolean;
  errorCode?: string;
};

export class StateStore {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  ensureKeys(keys: ExaKey[]): void {
    const stmt = this.db.prepare('INSERT INTO key_stats (id, weight, enabled) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET weight = excluded.weight, enabled = excluded.enabled');
    const tx = this.db.transaction(() => {
      for (const key of keys) stmt.run(key.id, key.weight, key.enabled ? 1 : 0);
    });
    tx();
  }

  recordAttempt(record: AttemptRecord): void {
    const success = record.statusCode !== undefined && record.statusCode >= 200 && record.statusCode < 400;
    this.db.prepare(`
      UPDATE key_stats
      SET total_requests = total_requests + 1,
          success_count = success_count + ?,
          failure_count = failure_count + ?,
          retry_count = retry_count + ?,
          last_status = ?,
          last_error = ?,
          last_latency_ms = ?,
          updated_at = unixepoch()
      WHERE id = ?
    `).run(success ? 1 : 0, success ? 0 : 1, record.retry ? 1 : 0, record.statusCode ?? null, record.errorCode ?? null, record.latencyMs, record.keyId);
  }

  listKeyStats(): Array<Record<string, unknown>> {
    return this.db.prepare(`
      SELECT id,
             weight,
             enabled,
             total_requests AS totalRequests,
             success_count AS successCount,
             failure_count AS failureCount,
             retry_count AS retryCount,
             last_status AS lastStatus,
             last_error AS lastError,
             last_latency_ms AS lastLatencyMs,
             cooldown_until AS cooldownUntil
      FROM key_stats ORDER BY id
    `).all() as Array<Record<string, unknown>>;
  }

  setCooldown(keyId: string, cooldownUntil: number, reason: string): void {
    this.db.prepare('UPDATE key_stats SET cooldown_until = ?, last_error = ?, updated_at = unixepoch() WHERE id = ?').run(cooldownUntil, reason, keyId);
  }

  setEnabled(keyId: string, enabled: boolean): void {
    this.db.prepare('UPDATE key_stats SET enabled = ?, updated_at = unixepoch() WHERE id = ?').run(enabled ? 1 : 0, keyId);
  }

  setResourceAffinity(resourceType: string, resourceId: string, keyId: string): void {
    this.db.prepare('INSERT INTO resource_affinity (resource_type, resource_id, key_id, created_at) VALUES (?, ?, ?, unixepoch()) ON CONFLICT(resource_type, resource_id) DO UPDATE SET key_id = excluded.key_id').run(resourceType, resourceId, keyId);
  }

  getResourceAffinity(resourceType: string, resourceId: string): string | undefined {
    const row = this.db.prepare('SELECT key_id AS keyId FROM resource_affinity WHERE resource_type = ? AND resource_id = ?').get(resourceType, resourceId) as { keyId: string } | undefined;
    return row?.keyId;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS key_stats (
        id TEXT PRIMARY KEY,
        weight INTEGER NOT NULL,
        enabled INTEGER NOT NULL,
        total_requests INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_status INTEGER,
        last_error TEXT,
        last_latency_ms INTEGER,
        cooldown_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT unixepoch()
      );
      CREATE TABLE IF NOT EXISTS resource_affinity (
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        key_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (resource_type, resource_id)
      );
    `);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/state.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.ts test/state.test.ts
git commit -m "feat: add sqlite state store"
```

## Task 7: Retry Classification and Backoff

**Files:**
* Create: `src/retry.ts`
* Create: `test/retry.test.ts`

- [ ] **Step 1: Write failing retry tests**

Create `test/retry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyRetry, retryDelayMs } from '../src/retry.js';

describe('retry', () => {
  it('classifies retryable status codes', () => {
    expect(classifyRetry({ statusCode: 429 })).toEqual({ retryable: true, reason: 'rate_limit' });
    expect(classifyRetry({ statusCode: 503 })).toEqual({ retryable: true, reason: 'upstream_5xx' });
    expect(classifyRetry({ statusCode: 400 })).toEqual({ retryable: false, reason: 'client_error' });
  });

  it('classifies timeout errors', () => {
    expect(classifyRetry({ errorCode: 'UND_ERR_HEADERS_TIMEOUT' })).toEqual({ retryable: true, reason: 'timeout' });
  });

  it('uses configured backoff and clamps to final value', () => {
    expect(retryDelayMs([100, 250], 0, 0)).toBe(100);
    expect(retryDelayMs([100, 250], 5, 0)).toBe(250);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/retry.test.ts`

Expected: FAIL because retry module does not exist.

- [ ] **Step 3: Implement retry helpers**

Create `src/retry.ts`:

```ts
export type RetryReason = 'rate_limit' | 'timeout' | 'upstream_5xx' | 'transient_status' | 'client_error' | 'not_retryable';

export function classifyRetry(input: { statusCode?: number; errorCode?: string }): { retryable: boolean; reason: RetryReason } {
  if (input.errorCode && ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(input.errorCode)) {
    return { retryable: true, reason: 'timeout' };
  }
  const status = input.statusCode;
  if (status === 429) return { retryable: true, reason: 'rate_limit' };
  if (status === 408 || status === 425) return { retryable: true, reason: 'transient_status' };
  if (status !== undefined && status >= 500 && status <= 599) return { retryable: true, reason: 'upstream_5xx' };
  if (status !== undefined && status >= 400 && status <= 499) return { retryable: false, reason: 'client_error' };
  return { retryable: false, reason: 'not_retryable' };
}

export function retryDelayMs(backoffs: number[], attemptIndex: number, jitterMs = Math.floor(Math.random() * 50)): number {
  if (backoffs.length === 0) return jitterMs;
  const base = backoffs[Math.min(attemptIndex, backoffs.length - 1)];
  return base + jitterMs;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- test/retry.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/retry.ts test/retry.test.ts
git commit -m "feat: add retry classification"
```

## Task 8: Upstream Client and Fake Exa Server

**Files:**
* Create: `src/upstream.ts`
* Create: `test/helpers/fakeExa.ts`
* Create: `test/proxy.failover.test.ts`

- [ ] **Step 1: Write fake upstream helper and failing upstream pass-through test**

Create `test/helpers/fakeExa.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify';

export type SeenRequest = { method: string; url: string; headers: Record<string, unknown>; body: unknown };

export async function createFakeExa(handler: (request: SeenRequest, count: number) => { status: number; body: unknown; headers?: Record<string, string> }): Promise<{ app: FastifyInstance; url: string; seen: SeenRequest[] }> {
  const app = Fastify({ logger: false });
  const seen: SeenRequest[] = [];
  app.all('/*', async (request, reply) => {
    const item = { method: request.method, url: request.url, headers: request.headers, body: request.body };
    seen.push(item);
    const response = handler(item, seen.length);
    for (const [name, value] of Object.entries(response.headers ?? {})) reply.header(name, value);
    return reply.code(response.status).send(response.body);
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Fake Exa did not bind to a TCP port');
  return { app, url: `http://127.0.0.1:${address.port}`, seen };
}
```

Create `test/proxy.failover.test.ts` with the first failing integration test:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createFakeExa } from './helpers/fakeExa.js';

const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

describe('proxy pass-through', () => {
  it('forwards method, path, body, and selected Exa key', async () => {
    const fake = await createFakeExa(() => ({ status: 200, body: { ok: true } }));
    apps.push(fake.app);
    const app = await buildApp({
      config: {
        host: '127.0.0.1',
        port: 0,
        upstreamUrl: fake.url,
        keys: [{ id: 'a', value: 'key-a', weight: 1, enabled: true }],
        proxyTokens: ['client_token'],
        adminTokens: ['admin_token'],
        statePath: ':memory:',
        selectionStrategy: 'weighted_round_robin',
        maxAttempts: 1,
        attemptTimeoutMs: 30000,
        retryBackoffMs: [1],
        failureThreshold: 3,
        failureWindowSeconds: 60,
        cooldownSeconds: 120,
        rateLimitCooldownSeconds: 300,
        maxBodyBytes: 20971520,
        allowedPaths: ['/**'],
        resourceAffinity: true,
        logLevel: 'silent'
      }
    });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/search?debug=1',
      headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' },
      payload: { query: 'hello' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(fake.seen[0].url).toBe('/search?debug=1');
    expect(fake.seen[0].headers['x-api-key']).toBe('key-a');
    expect(JSON.stringify(fake.seen[0].headers)).not.toContain('client_token');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- test/proxy.failover.test.ts`

Expected: FAIL because proxy route and upstream client are not implemented.

- [ ] **Step 3: Implement upstream client shell**

Create `src/upstream.ts`:

```ts
import { request as undiciRequest } from 'undici';

export type UpstreamResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: NodeJS.ReadableStream;
};

export async function callUpstream(options: {
  baseUrl: string;
  method: string;
  pathWithQuery: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  timeoutMs: number;
}): Promise<UpstreamResult> {
  const url = new URL(options.pathWithQuery, options.baseUrl);
  const response = await undiciRequest(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    headersTimeout: options.timeoutMs,
    bodyTimeout: options.timeoutMs
  });
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body
  };
}
```

- [ ] **Step 4: Implement first proxy route in `src/app.ts` using existing utilities**

Add a catch-all route after admin health. The complete `buildApp` body should create a scheduler, require proxy auth, check allowed paths, pick a key, call upstream, and pipe the upstream body to the reply.

Use this implementation shape:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import { isAuthorized } from './auth.js';
import { buildUpstreamHeaders, sanitizeResponseHeaders } from './headers.js';
import { isPathAllowed } from './routes.js';
import { KeyScheduler } from './scheduler.js';
import { callUpstream } from './upstream.js';

// keep ProxyConfig type from previous task

export async function buildApp(options: { config: ProxyConfig }): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.config.logLevel === 'silent' ? false : { level: options.config.logLevel },
    bodyLimit: options.config.maxBodyBytes
  });
  const scheduler = new KeyScheduler({ keys: options.config.keys, strategy: options.config.selectionStrategy });

  app.get('/_proxy/health', async (request, reply) => {
    if (!isAuthorized(request.headers, options.config.adminTokens)) {
      return reply.code(401).send({ error: { type: 'proxy_error', code: 'unauthorized', message: 'Unauthorized' } });
    }
    return { ok: true, keys: options.config.keys.length };
  });

  app.all('/*', async (request, reply) => {
    if (request.url.startsWith('/_proxy/')) return reply.code(404).send({ error: { type: 'proxy_error', code: 'not_found', message: 'Not found' } });
    if (!isAuthorized(request.headers, options.config.proxyTokens)) {
      return reply.code(401).send({ error: { type: 'proxy_error', code: 'unauthorized', message: 'Unauthorized' } });
    }
    const pathWithQuery = request.url;
    const pathname = new URL(pathWithQuery, 'http://proxy.local').pathname;
    if (!isPathAllowed(pathname, options.config.allowedPaths)) {
      return reply.code(403).send({ error: { type: 'proxy_error', code: 'route_forbidden', message: 'Route is not allowed' } });
    }
    const key = scheduler.next();
    if (!key) {
      return reply.code(503).send({ error: { type: 'proxy_error', code: 'no_healthy_keys', message: 'No healthy Exa API key is currently available.' } });
    }
    const upstream = await callUpstream({
      baseUrl: options.config.upstreamUrl,
      method: request.method,
      pathWithQuery,
      headers: buildUpstreamHeaders(request.headers, key.value),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      timeoutMs: options.config.attemptTimeoutMs
    });
    for (const [name, value] of Object.entries(sanitizeResponseHeaders(upstream.headers))) reply.header(name, value);
    return reply.code(upstream.statusCode).send(upstream.body);
  });

  return app;
}
```

- [ ] **Step 5: Run pass-through test**

Run: `npm test -- test/proxy.failover.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/upstream.ts test/helpers/fakeExa.ts test/proxy.failover.test.ts src/app.ts
git commit -m "feat: add transparent upstream proxying"
```

## Task 9: Failover, Cooldowns, and Metrics Recording

**Files:**
* Create: `src/proxy.ts`
* Modify: `src/app.ts`
* Modify: `src/state.ts`
* Modify: `test/proxy.failover.test.ts`

- [ ] **Step 1: Add failing failover tests**

Append to `test/proxy.failover.test.ts`:

```ts
describe('proxy failover', () => {
  it('retries a 429 with another key and cools down the rate-limited key', async () => {
    const fake = await createFakeExa((request, count) => count === 1
      ? { status: 429, body: { error: 'rate limited' }, headers: { 'retry-after': '60' } }
      : { status: 200, body: { ok: true, used: request.headers['x-api-key'] } });
    apps.push(fake.app);
    const app = await buildApp({ config: testConfig(fake.url, 2) });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: '/search', headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' }, payload: { query: 'hello' } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, used: 'key-b' });
    expect(fake.seen.map((item) => item.headers['x-api-key'])).toEqual(['key-a', 'key-b']);
  });

  it('returns 503 when all keys are cooling down', async () => {
    const fake = await createFakeExa(() => ({ status: 429, body: { error: 'rate limited' } }));
    apps.push(fake.app);
    const app = await buildApp({ config: testConfig(fake.url, 2) });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: '/search', headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' }, payload: { query: 'hello' } });

    expect(response.statusCode).toBe(429);
    const second = await app.inject({ method: 'POST', url: '/search', headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' }, payload: { query: 'hello' } });
    expect(second.statusCode).toBe(503);
    expect(second.json().error.code).toBe('no_healthy_keys');
  });
});

function testConfig(upstreamUrl: string, maxAttempts: number) {
  return {
    host: '127.0.0.1',
    port: 0,
    upstreamUrl,
    keys: [
      { id: 'a', value: 'key-a', weight: 1, enabled: true },
      { id: 'b', value: 'key-b', weight: 1, enabled: true }
    ],
    proxyTokens: ['client_token'],
    adminTokens: ['admin_token'],
    statePath: ':memory:',
    selectionStrategy: 'weighted_round_robin' as const,
    maxAttempts,
    attemptTimeoutMs: 30000,
    retryBackoffMs: [1],
    failureThreshold: 3,
    failureWindowSeconds: 60,
    cooldownSeconds: 120,
    rateLimitCooldownSeconds: 300,
    maxBodyBytes: 20971520,
    allowedPaths: ['/**'],
    resourceAffinity: true,
    logLevel: 'silent'
  };
}
```

Move the earlier inline config in the first test to use `testConfig(fake.url, 1)`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/proxy.failover.test.ts`

Expected: FAIL because there is no retry/failover loop.

- [ ] **Step 3: Extract proxy handler into `src/proxy.ts`**

Create `src/proxy.ts` with a `handleProxyRequest` function that receives config, scheduler, and optional state store. Implement this behavior:

```ts
// Pseudocode-level target, convert to compiling TypeScript during implementation.
// 1. Auth proxy token.
// 2. Check path allowlist.
// 3. Decide retry safety with isRetrySafe().
// 4. For attempt < min(maxAttempts, keys.length):
//    a. choose scheduler.next(now, excludedKeys)
//    b. callUpstream()
//    c. record attempt in StateStore
//    d. if status retryable and request is retry-safe and response is not yet sent:
//       mark key cooldown for 429 or repeated 5xx/timeout
//       exclude key and retry after retryDelayMs()
//    e. otherwise stream response to client and stop
// 5. If no key exists, return 503 proxy error.
// 6. If attempts exhausted after upstream responses, return the last upstream response body/status.
```

Concrete implementation requirements:

* Use `classifyRetry()`.
* Use `retryDelayMs()`.
* Use `scheduler.coolDown()` on `429` with `Retry-After` when present.
* Use `StateStore.recordAttempt()` for every attempt.
* Do not retry non-safe mutation routes unless `isRetrySafe()` returns true.
* Do not include key values in errors.

- [ ] **Step 4: Wire `src/app.ts` to create `StateStore` and call proxy handler**

Update `buildApp` so it:

* Creates `const scheduler = new KeyScheduler(...)`.
* Creates `const state = new StateStore(options.config.statePath)`.
* Calls `state.ensureKeys(options.config.keys)`.
* Closes the store on Fastify `onClose`.
* Uses `handleProxyRequest()` in the catch-all route.

- [ ] **Step 5: Run failover tests**

Run: `npm test -- test/proxy.failover.test.ts test/state.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts src/app.ts src/state.ts test/proxy.failover.test.ts
git commit -m "feat: add upstream failover and cooldowns"
```

## Task 10: Streaming Behavior

**Files:**
* Modify: `test/helpers/fakeExa.ts`
* Create: `test/proxy.streaming.test.ts`
* Modify: `src/upstream.ts`
* Modify: `src/proxy.ts`

- [ ] **Step 1: Add fake streaming support**

Extend `test/helpers/fakeExa.ts` so handlers may return a Node `Readable` body and `text/event-stream` headers.

Use this response type:

```ts
import { Readable } from 'node:stream';

export type FakeResponse = {
  status: number;
  body: unknown | Readable;
  headers?: Record<string, string>;
};
```

When `body instanceof Readable`, call `reply.code(response.status).send(response.body)`.

- [ ] **Step 2: Write failing streaming tests**

Create `test/proxy.streaming.test.ts`:

```ts
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createFakeExa } from './helpers/fakeExa.js';

const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

describe('streaming proxy', () => {
  it('passes text/event-stream chunks through unchanged', async () => {
    const fake = await createFakeExa(() => ({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: Readable.from(['data: one\n\n', 'data: two\n\n'])
    }));
    apps.push(fake.app);
    const app = await buildApp({ config: {
      host: '127.0.0.1', port: 0, upstreamUrl: fake.url,
      keys: [{ id: 'a', value: 'key-a', weight: 1, enabled: true }],
      proxyTokens: ['client_token'], adminTokens: ['admin_token'], statePath: ':memory:',
      selectionStrategy: 'weighted_round_robin', maxAttempts: 1, attemptTimeoutMs: 30000,
      retryBackoffMs: [1], failureThreshold: 3, failureWindowSeconds: 60,
      cooldownSeconds: 120, rateLimitCooldownSeconds: 300, maxBodyBytes: 20971520,
      allowedPaths: ['/**'], resourceAffinity: true, logLevel: 'silent'
    } });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: '/search', headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' }, payload: { query: 'hello', stream: true } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toBe('data: one\n\ndata: two\n\n');
  });
});
```

- [ ] **Step 3: Run streaming test to verify failure if current code buffers or drops content type**

Run: `npm test -- test/proxy.streaming.test.ts`

Expected: FAIL until fake upstream and proxy streaming handling are correct.

- [ ] **Step 4: Fix streaming pass-through**

In `src/upstream.ts` and `src/proxy.ts`, ensure:

* Upstream `body` is returned as a stream.
* Proxy does not parse or buffer upstream stream.
* Response headers are sent before `reply.send(upstream.body)`.
* Retry is only attempted before sending an upstream response to the client.

- [ ] **Step 5: Run streaming and failover tests**

Run: `npm test -- test/proxy.streaming.test.ts test/proxy.failover.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/upstream.ts src/proxy.ts test/helpers/fakeExa.ts test/proxy.streaming.test.ts
git commit -m "feat: preserve upstream streaming responses"
```

## Task 11: Resource Affinity

**Files:**
* Modify: `src/proxy.ts`
* Modify: `src/routes.ts`
* Modify: `src/state.ts`
* Create: `test/proxy.affinity.test.ts`

- [ ] **Step 1: Write failing resource affinity test**

Create `test/proxy.affinity.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createFakeExa } from './helpers/fakeExa.js';

const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

describe('resource affinity', () => {
  it('uses the creating key for follow-up resource requests', async () => {
    const fake = await createFakeExa((request) => {
      if (request.url === '/agent/runs' && request.method === 'POST') return { status: 200, body: { id: 'run_123' } };
      return { status: 200, body: { used: request.headers['x-api-key'] } };
    });
    apps.push(fake.app);
    const app = await buildApp({ config: {
      host: '127.0.0.1', port: 0, upstreamUrl: fake.url,
      keys: [
        { id: 'a', value: 'key-a', weight: 1, enabled: true },
        { id: 'b', value: 'key-b', weight: 1, enabled: true }
      ],
      proxyTokens: ['client_token'], adminTokens: ['admin_token'], statePath: ':memory:',
      selectionStrategy: 'weighted_round_robin', maxAttempts: 1, attemptTimeoutMs: 30000,
      retryBackoffMs: [1], failureThreshold: 3, failureWindowSeconds: 60,
      cooldownSeconds: 120, rateLimitCooldownSeconds: 300, maxBodyBytes: 20971520,
      allowedPaths: ['/**'], resourceAffinity: true, logLevel: 'silent'
    } });
    apps.push(app);

    await app.inject({ method: 'POST', url: '/agent/runs', headers: { authorization: 'Bearer client_token', 'content-type': 'application/json' }, payload: { prompt: 'hello' } });
    const followUp = await app.inject({ method: 'GET', url: '/agent/runs/run_123', headers: { authorization: 'Bearer client_token' } });

    expect(followUp.statusCode).toBe(200);
    expect(followUp.json()).toEqual({ used: 'key-a' });
  });
});
```

- [ ] **Step 2: Run affinity test to verify failure**

Run: `npm test -- test/proxy.affinity.test.ts`

Expected: FAIL because creation responses are not mapped to key IDs.

- [ ] **Step 3: Implement conservative affinity extraction**

In `src/proxy.ts`:

* For non-streaming JSON responses with status `2xx`, inspect response body only for known creation paths.
* For `POST /agent/runs`, store `agent_run` with `body.id`.
* For `POST /research/v1`, store `research` with `body.id` or `body.researchId`.
* For `POST /monitors`, store `monitor` with `body.id`.
* For `POST /v0/websets`, store `webset` with `body.id`.
* For `POST /v0/webhooks`, store `webhook` with `body.id`.
* For `POST /v0/imports`, store `import` with `body.id`.

Because extraction requires reading the response body, only do this for JSON responses that are not `text/event-stream`. Re-send the original JSON body unchanged after extraction.

Before scheduling normal selection, call `parseResourceAffinity(pathname)`. If a mapping exists, select that key ID directly. Add a scheduler method `getById(keyId, now)` or equivalent that returns the key only if enabled and not cooling down. If the affinity key is unavailable, return `503` with code `affinity_key_unavailable`.

- [ ] **Step 4: Run affinity and streaming tests**

Run: `npm test -- test/proxy.affinity.test.ts test/proxy.streaming.test.ts test/proxy.failover.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/routes.ts src/state.ts test/proxy.affinity.test.ts
git commit -m "feat: add resource affinity routing"
```

## Task 12: Admin API and Metrics

**Files:**
* Create: `src/admin.ts`
* Create: `src/metrics.ts`
* Modify: `src/app.ts`
* Create: `test/admin.test.ts`

- [ ] **Step 1: Write failing admin tests**

Create `test/admin.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

function config() {
  return {
    host: '127.0.0.1', port: 0, upstreamUrl: 'http://127.0.0.1:9',
    keys: [{ id: 'a', value: 'secret-key-a', weight: 1, enabled: true }],
    proxyTokens: ['client_token'], adminTokens: ['admin_token'], statePath: ':memory:',
    selectionStrategy: 'weighted_round_robin' as const, maxAttempts: 1, attemptTimeoutMs: 50,
    retryBackoffMs: [1], failureThreshold: 3, failureWindowSeconds: 60,
    cooldownSeconds: 120, rateLimitCooldownSeconds: 300, maxBodyBytes: 20971520,
    allowedPaths: ['/**'], resourceAffinity: true, logLevel: 'silent'
  };
}

describe('admin api', () => {
  it('requires admin auth and returns sanitized key stats', async () => {
    const app = await buildApp({ config: config() });
    apps.push(app);

    expect((await app.inject({ method: 'GET', url: '/_proxy/keys' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/_proxy/keys', headers: { authorization: 'Bearer admin_token' } });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"id":"a"');
    expect(response.body).not.toContain('secret-key-a');
  });

  it('disables and enables keys', async () => {
    const app = await buildApp({ config: config() });
    apps.push(app);
    const headers = { authorization: 'Bearer admin_token' };

    expect((await app.inject({ method: 'POST', url: '/_proxy/keys/a/disable', headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/_proxy/keys/a/enable', headers })).statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run admin tests to verify failure**

Run: `npm test -- test/admin.test.ts`

Expected: FAIL because admin routes do not exist.

- [ ] **Step 3: Implement metrics renderer**

Create `src/metrics.ts`:

```ts
export function renderPrometheusKeyMetrics(rows: Array<Record<string, unknown>>): string {
  const lines = ['# HELP exa_proxy_requests_total Total upstream attempts by key', '# TYPE exa_proxy_requests_total counter'];
  for (const row of rows) {
    lines.push(`exa_proxy_requests_total{key_id="${row.id}"} ${row.totalRequests ?? 0}`);
    lines.push(`exa_proxy_key_failures_total{key_id="${row.id}"} ${row.failureCount ?? 0}`);
  }
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 4: Implement admin route registration**

Create `src/admin.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { isAuthorized } from './auth.js';
import { renderPrometheusKeyMetrics } from './metrics.js';
import type { ProxyConfig } from './app.js';
import type { KeyScheduler } from './scheduler.js';
import type { StateStore } from './state.js';

export async function registerAdminRoutes(app: FastifyInstance, deps: { config: ProxyConfig; scheduler: KeyScheduler; state: StateStore }): Promise<void> {
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/_proxy/') && !isAuthorized(request.headers, deps.config.adminTokens)) {
      return reply.code(401).send({ error: { type: 'proxy_error', code: 'unauthorized', message: 'Unauthorized' } });
    }
  });

  app.get('/_proxy/health', async () => ({ ok: true, keys: deps.config.keys.length }));
  app.get('/_proxy/keys', async () => ({ keys: deps.state.listKeyStats(), scheduler: deps.scheduler.snapshot() }));
  app.get('/_proxy/metrics', async (_request, reply) => reply.type('text/plain').send(renderPrometheusKeyMetrics(deps.state.listKeyStats())));
  app.post('/_proxy/keys/:id/disable', async (request) => {
    const id = (request.params as { id: string }).id;
    deps.scheduler.setDisabled(id, true);
    deps.state.setEnabled(id, false);
    return { ok: true, id, enabled: false };
  });
  app.post('/_proxy/keys/:id/enable', async (request) => {
    const id = (request.params as { id: string }).id;
    deps.scheduler.setDisabled(id, false);
    deps.state.setEnabled(id, true);
    return { ok: true, id, enabled: true };
  });
  app.post('/_proxy/keys/:id/reset-circuit', async (request) => {
    const id = (request.params as { id: string }).id;
    deps.scheduler.coolDown(id, 0, Date.now(), 'manual_reset');
    deps.state.setCooldown(id, 0, 'manual_reset');
    return { ok: true, id };
  });
}
```

- [ ] **Step 5: Wire admin routes in app**

Update `src/app.ts`:

* Remove the inline `/_proxy/health` route.
* Call `await registerAdminRoutes(app, { config: options.config, scheduler, state })` before the catch-all proxy route.
* Keep the catch-all route returning `404` for unknown `/_proxy/*` paths.

- [ ] **Step 6: Run admin and existing tests**

Run: `npm test -- test/admin.test.ts test/app.test.ts test/proxy.failover.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/admin.ts src/metrics.ts src/app.ts test/admin.test.ts
git commit -m "feat: add sanitized admin api and metrics"
```

## Task 13: Stable Proxy Error Responses

**Files:**
* Create: `src/errors.ts`
* Modify: `src/app.ts`
* Modify: `src/proxy.ts`
* Create: `test/errors.test.ts`

- [ ] **Step 1: Write failing error shape tests**

Create `test/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { proxyError } from '../src/errors.js';

describe('proxyError', () => {
  it('returns stable JSON shape with request id', () => {
    expect(proxyError('no_healthy_keys', 'No healthy Exa API key is currently available.', 'req_123')).toEqual({
      error: {
        type: 'proxy_error',
        code: 'no_healthy_keys',
        message: 'No healthy Exa API key is currently available.',
        requestId: 'req_123'
      }
    });
  });
});
```

- [ ] **Step 2: Run error test to verify failure**

Run: `npm test -- test/errors.test.ts`

Expected: FAIL because errors module does not exist.

- [ ] **Step 3: Implement error helper**

Create `src/errors.ts`:

```ts
export function proxyError(code: string, message: string, requestId: string): { error: { type: 'proxy_error'; code: string; message: string; requestId: string } } {
  return { error: { type: 'proxy_error', code, message, requestId } };
}

export function requestIdFrom(headers: Record<string, string | string[] | undefined>): string {
  const existing = headers['x-request-id'];
  if (typeof existing === 'string' && existing.length > 0) return existing;
  return `req_${crypto.randomUUID()}`;
}
```

- [ ] **Step 4: Replace ad hoc proxy errors**

In `src/app.ts` and `src/proxy.ts`, replace inline error objects with `proxyError(code, message, requestId)`.

Requirements:

* `401` uses code `unauthorized`.
* Disallowed routes use `route_forbidden`.
* No healthy key uses `no_healthy_keys`.
* Affinity key unavailable uses `affinity_key_unavailable`.
* Upstream protocol failure uses `upstream_error`.
* Timeout exhaustion uses `upstream_timeout`.

- [ ] **Step 5: Run tests**

Run: `npm test -- test/errors.test.ts test/admin.test.ts test/proxy.failover.test.ts && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/app.ts src/proxy.ts test/errors.test.ts
git commit -m "feat: standardize proxy error responses"
```

## Task 14: Docker Deployment Artifacts

**Files:**
* Create: `Dockerfile`
* Create: `.dockerignore`
* Create: `docker-compose.yml`
* Modify: `README.md`

- [ ] **Step 1: Create Docker ignore file**

Create `.dockerignore`:

```dockerignore
node_modules
dist
.env
*.sqlite
*.sqlite-shm
*.sqlite-wal
docs/superpowers
npm-debug.log*
```

- [ ] **Step 2: Create multi-stage Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY test ./test
RUN npm test
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --system --uid 10001 --create-home appuser && mkdir -p /data && chown appuser:appuser /data
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER appuser
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/_proxy/health',{headers:{authorization:'Bearer '+process.env.EXA_ADMIN_HEALTHCHECK_TOKEN}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/index.js"]
```

- [ ] **Step 3: Create Docker Compose file**

Create `docker-compose.yml`:

```yaml
services:
  exa-proxy:
    build: .
    image: exa-reverse-proxy:local
    restart: unless-stopped
    ports:
      - "8787:8787"
    env_file:
      - .env
    environment:
      HOST: 0.0.0.0
      PORT: 8787
      EXA_STATE_PATH: /data/exa-proxy.sqlite
      EXA_ADMIN_HEALTHCHECK_TOKEN: ${EXA_ADMIN_HEALTHCHECK_TOKEN:-replace_with_admin_token}
    volumes:
      - exa_proxy_data:/data

volumes:
  exa_proxy_data:
```

- [ ] **Step 4: Create README deployment section**

Create or update `README.md`:

```md
# Exa Reverse Proxy

Docker-deployable reverse proxy for Exa that balances requests across multiple upstream Exa API keys while exposing one Exa-compatible endpoint.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Replace example Exa keys and proxy/admin tokens.
3. Start the service:

```bash
docker compose up --build -d
```

4. Check health:

```bash
curl -H "Authorization: Bearer $EXA_ADMIN_HEALTHCHECK_TOKEN" http://127.0.0.1:8787/_proxy/health
```

5. Call Exa through the proxy:

```bash
curl -X POST http://127.0.0.1:8787/search \
  -H "Authorization: Bearer $EXA_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"latest LLM research","numResults":3}'
```

## Environment

See `.env.example` for the full configuration contract. Raw Exa keys must never be committed.

## Admin Endpoints

* `GET /_proxy/health`
* `GET /_proxy/keys`
* `GET /_proxy/metrics`
* `POST /_proxy/keys/:id/disable`
* `POST /_proxy/keys/:id/enable`
* `POST /_proxy/keys/:id/reset-circuit`
```

- [ ] **Step 5: Build Docker image**

Run: `docker build -t exa-reverse-proxy:local .`

Expected: image builds successfully and test stage passes.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml README.md
git commit -m "chore: add docker deployment artifacts"
```

## Task 15: End-to-End Verification and Release Checklist

**Files:**
* Modify: `README.md`
* Create: `docs/deployment-checklist.md`

- [ ] **Step 1: Run full local test suite**

Run: `npm test && npm run build`

Expected: all tests pass and TypeScript build succeeds.

- [ ] **Step 2: Run Docker image build**

Run: `docker build -t exa-reverse-proxy:local .`

Expected: build succeeds.

- [ ] **Step 3: Run Docker Compose smoke test with fake-safe config**

Create a local `.env` from `.env.example` using sample non-real Exa keys and tokens:

```dotenv
EXA_KEYS=exa_a:fake_key_a:1,exa_b:fake_key_b:1
EXA_PROXY_TOKENS=client_local_token
EXA_ADMIN_TOKENS=admin_local_token
EXA_ADMIN_HEALTHCHECK_TOKEN=admin_local_token
```

Run: `docker compose up --build -d`

Expected: container starts and health check becomes healthy.

Run: `docker compose ps`

Expected: service state is running or healthy.

Run: `curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/health`

Expected: response contains `"ok":true`.

- [ ] **Step 4: Run real-key manual checks only when keys are available**

With real Exa keys in `.env`, run:

```bash
curl -X POST http://127.0.0.1:8787/search \
  -H "Authorization: Bearer client_local_token" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is Exa search?","numResults":2}'
```

Expected: Exa-compatible JSON response with `results` or an Exa-owned error body.

Run:

```bash
curl -X POST http://127.0.0.1:8787/contents \
  -H "Authorization: Bearer client_local_token" \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://exa.ai"],"text":true}'
```

Expected: Exa-compatible JSON response.

Run:

```bash
curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/keys
```

Expected: key IDs and counters are visible; raw Exa key values are absent.

- [ ] **Step 5: Stop local deployment**

Run: `docker compose down`

Expected: service stops cleanly and the named volume remains for state persistence.

- [ ] **Step 6: Commit final docs updates**

```bash
git add README.md docs/deployment-checklist.md
git commit -m "docs: add deployment verification checklist"
```

## Self-Review Checklist

Spec coverage:

* Official path compatibility: Tasks 4, 8, 9, 10.
* Multi-key round-robin and weighted use: Task 5.
* `429`, timeout, and transient failover: Tasks 7 and 9.
* Circuit/cooldown state: Tasks 5, 6, 9, 12.
* Per-key stats and admin visibility: Tasks 6 and 12.
* Hidden real Exa keys and auth separation: Tasks 3, 4, 12, 13.
* Streaming behavior: Task 10.
* Resource affinity: Task 11.
* Docker deployment: Tasks 14 and 15.

Implementation caveats to check during execution:

* Fastify catch-all syntax may need adjustment for Fastify 5 if `app.all('/*')` does not match all paths in tests. Use the smallest compatible catch-all pattern and update tests accordingly.
* `better-sqlite3` native install can require build tools on some hosts. Docker uses Debian slim; if install fails, add required packages in the deps stage.
* The healthcheck uses `EXA_ADMIN_HEALTHCHECK_TOKEN`; document that it must match one value in `EXA_ADMIN_TOKENS`.
* Response-body inspection for resource affinity must not run for event streams or large binary responses.

## Final Verification Commands

Run these before calling the implementation complete:

```bash
npm test
npm run build
docker build -t exa-reverse-proxy:local .
docker compose up --build -d
curl -H "Authorization: Bearer admin_local_token" http://127.0.0.1:8787/_proxy/health
docker compose down
```

Expected final state:

* All automated tests pass.
* TypeScript build succeeds.
* Docker image builds.
* Docker Compose service starts.
* Health endpoint works through admin auth.
* Admin key output never contains raw Exa key values.
