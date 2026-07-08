# Frontend Type Safety

## Overview

Browser UI modules are JavaScript, while backend/admin API contracts are TypeScript. The safety boundary is enforced by escaping, narrow helper functions, strict build checks, and E2E coverage.

## Required Patterns

- Use `esc()` from `state.js` for server-provided text inserted into HTML strings.
- Convert numeric values through helpers such as `fmt()`, `pct()`, `ms()`, `httpStatusClass()`, and `observedRequestsFor()`.
- Use `encodeURIComponent()` for ids and request ids in API paths.
- Keep config parsing and API route types in TypeScript files under `src/`; do not duplicate backend contract parsing in UI modules.

## Validation

- API helpers throw cleaned error messages through `extractErrorMessage()`; UI actions catch those errors and surface concise operator feedback.
- Raw key display must respect `rawKeyDisplayAllowed()` and must go through the audited `POST /_proxy/keys/:id/secret` route.

## Forbidden Patterns

- No `innerHTML` with unescaped server values.
- No ad hoc `JSON.stringify(log)` search over all fields for user-facing log filtering; use targeted fields.
- No blind numeric status classification without `Number.isFinite` handling.

## Wrong vs Correct

### Wrong

```js
row.innerHTML = '<td>' + key.displayId + '</td>';
```

### Correct

```js
row.innerHTML = '<td>' + esc(displayLabel(key)) + '</td>';
```
