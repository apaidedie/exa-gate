# Logging Guidelines

## Overview

The project has two durable operator logs in SQLite plus Fastify process logging:

- Request logs: proxy attempts, status, latency, key chain, token id, and short query diagnostics.
- Admin audit logs: login, key mutation, export, prune, raw key display, and webhook actions.
- Process logs: startup/runtime warnings through Fastify logger.

## Request Log Contract

`StateStore.recordRequestLog()` accepts:

```typescript
{
  requestId: string;
  tokenId: string | null;
  method: string;
  path: string;
  status: number;
  keyIds: string[];
  attempts: number;
  latencyMs: number;
  errorCode: string | null;
  query?: string | null;
}
```

The `query` field is a short extracted search query for diagnostics. Do not store full request bodies.

## Admin Audit Contract

`StateStore.recordAdminAudit()` accepts actor token id, action, optional target id, success flag, detail, IP, user agent, and timestamp. Use it for sensitive or state-changing admin operations.

## What To Log

- Unauthorized proxy requests and forbidden paths, with no key ids.
- Every upstream attempt aggregate as one request log for the downstream request.
- Key health tests as request logs with query `Exa key health check`.
- Admin exports, pruning, key mutations, raw secret access, and webhook delivery/test as audit logs.

## What Not To Log

- Raw Exa API keys.
- `EXA_PROXY_TOKENS`, `EXA_ADMIN_TOKENS`, webhook bearer tokens, or encryption secrets.
- Full request bodies or arbitrary headers.
- Downstream Authorization headers.

## Required Patterns

- Use internal key ids in logs; raw secret display is gated by policy and audited separately.
- Keep error reasons low-cardinality (`rate_limit`, `timeout`, `upstream_error`, etc.) so metrics remain useful.
- Use `redactSecrets()` for any future diagnostic string that may contain configured secrets.

## Wrong vs Correct

### Wrong

```typescript
deps.state.recordAdminAudit({ actorTokenId, action: 'copy_key', success: true, detail: rawSecret });
```

### Correct

```typescript
deps.state.recordAdminAudit({ actorTokenId, action: 'copy_key', success: true, detail: 'raw key copied' });
```
