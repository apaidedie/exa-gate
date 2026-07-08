# Frontend State Management

## Overview

The console uses one exported mutable `state` object from `src/admin-ui/state.js`. This is deliberate: the UI is static, small, and has no framework runtime.

## State Categories

- Server state: `keys`, `logs`, `audit`, `observability`, `config`, `trace`, `keyFailures`.
- View state: `activeTab`, `selectedId`, pagination, filters, sort, selected key ids.
- Runtime state: refresh timer, SSE connection, event refresh guard.
- Browser persistence: admin session in `localStorage`/`sessionStorage`, secret display preference in `localStorage`.

## Server State Contract

- `refresh()` in `admin.js` is the primary synchronization point for keys, logs, observability, audit, and config.
- Fetch helpers belong in `api.js`; render files should not call `fetch` directly.
- SSE snapshot events should debounce into `refresh()` and must respect `state.eventRefreshPending` to avoid overlapping refreshes.

## View State Contract

- `state.activeTab` defaults to `keys` because key management is the main operator path.
- `switchTab()` owns tab activation, ARIA selected state, shell aside visibility, and render dispatch.
- Key selection should update `state.selectedId`, then call the detail renderer. Batch selection should update `state.selectedKeyIds`, then the batch bar.

## Wrong vs Correct

### Wrong

```js
document.querySelector('#logsBody').innerHTML = await fetch('/_proxy/logs').then((r) => r.text());
```

### Correct

```js
const data = await fetchLogs();
state.logs = data.logs || [];
renderLogs();
```

The correct path keeps auth headers, filters, escaping, and render ownership consistent.
