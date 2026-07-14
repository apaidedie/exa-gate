# Backend Directory Structure

## Overview

Backend code is organized by runtime boundary rather than by generic layers.

## Directory Layout

```text
src/
├── index.ts             # Config load, app startup, signal handling
├── app.ts               # Fastify app construction, plugin order, lifecycle
├── proxy.ts             # Catch-all Exa proxy flow and retry loop
├── routes.ts            # Allowed paths, retry safety, resource affinity parsing
├── retry.ts             # Upstream status/error classification and backoff
├── headers.ts           # Downstream/upstream header sanitization
├── auth.ts              # Proxy token authorization helpers
├── config.ts            # Environment parsing and validation
├── state.ts             # createStateStore facade + public types (may re-export)
├── state/               # Optional domain modules after B3 split (keys, logs, audit, sessions)
├── scheduler.ts         # Key selection, cooldown, adaptive scheduling
├── upstream.ts          # Undici upstream request/pool boundary
├── metrics.ts           # Prometheus rendering
├── admin.ts             # Admin route composition and CSV exports
├── admin/               # Admin auth, key actions, observability, static UI, webhook
└── util/                # Small shared helpers
```

If `src/state/` is introduced, keep `createStateStore` and public types importable from `./state.js` so `app.ts`, `proxy.ts`, and admin modules do not need churning import paths.

## Module Organization

- `buildApp()` owns Fastify construction, global hooks, admin route registration, and proxy catch-all route registration.
- Admin APIs must be registered before the proxy catch-all route.
- `/_proxy/live` is an unauthenticated liveness probe; it only proves the process can answer HTTP.
- `/_proxy/ready` is an unauthenticated readiness probe; it returns 200 only when at least one key is enabled and outside cooldown, otherwise 503 with a key-state summary.
- Other management routes under `/_proxy/*` require admin auth unless explicitly documented as probes.
- Proxy routes must not leak downstream `Authorization` or key headers to Exa; use `buildUpstreamHeaders()`.

## Naming Conventions

- Environment variables use `EXA_*`, except generic `HOST`, `PORT`, and `LOG_LEVEL`.
- Admin routes live under `/_proxy/*`; ordinary Exa paths are handled by the catch-all proxy route.
- SQLite table and column names use snake_case.

## Wrong vs Correct

### Wrong

```typescript
app.route({ method: ['GET', 'POST'], url: '/*', handler: proxyHandler });
await registerAdminRoutes(app, deps);
```

This makes admin routes unreachable because the catch-all route wins first.

### Correct

```typescript
await registerAdminRoutes(app, deps);
app.route({ method: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'], url: '/*', handler: proxyHandler });
```
