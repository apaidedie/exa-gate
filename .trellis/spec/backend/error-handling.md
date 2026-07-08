# Error Handling

## Overview

Proxy and admin errors use one stable JSON shape from `src/errors.ts`. The response must include a request id so callers can correlate API errors with request logs.

## Error Response Signature

```typescript
proxyError(code: string, message: string, requestId: string): {
  error: {
    type: 'proxy_error';
    code: string;
    message: string;
    requestId: string;
  };
}
```

`requestIdFrom(headers)` preserves an incoming `x-request-id` header when present, otherwise generates `req_<uuid>`.

## Common Codes

| Condition | HTTP | Code |
| --- | ---: | --- |
| Missing or invalid proxy/admin auth | 401 | `unauthorized` |
| Admin API requires HTTPS | 426 | `https_required` |
| Admin lockout | 423 | `admin_locked` |
| Proxy path not allowed | 403 | `route_forbidden` |
| Admin route missing | 404 | `route_not_found` or `key_not_found` |
| Invalid admin payload | 400 | `validation_error` |
| No healthy upstream key | 503 | `no_healthy_keys` |
| Upstream timeout | 504 | `upstream_timeout` |
| Upstream connection or final retry failure | 502 | `upstream_error` |

## Required Patterns

- Use `proxyError()` for proxy/admin API failures instead of ad hoc JSON.
- Include `requestIdFrom(request.headers)` in every generated error response.
- Record request logs before returning proxy authorization, path, upstream, or no-key failures.
- Keep user-facing messages concise; detailed operational context belongs in logs/audit, not error messages.

## Tests Required

- New error code: assert HTTP status and JSON shape in the route test that triggers it.
- Error helper change: update `test/errors.test.ts`.

## Wrong vs Correct

### Wrong

```typescript
return reply.code(400).send({ error: 'bad input' });
```

### Correct

```typescript
const requestId = requestIdFrom(request.headers);
return reply.code(400).send(proxyError('validation_error', 'Key id is required.', requestId));
```
