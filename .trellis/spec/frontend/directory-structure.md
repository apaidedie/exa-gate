# Frontend Directory Structure

## Overview

The Admin Console is intentionally small and static. All browser source lives in `src/admin-ui/`; no generated frontend source should be committed outside that directory.

## Directory Layout

```text
src/admin-ui/
├── index.html              # Static shell, stable ids, ARIA structure, copy
├── admin.css               # Design tokens, layout, responsive behavior, states
├── admin.js                # Event wiring, refresh loop, tab switching, async actions
├── api.js                  # Fetch/session/export helpers
├── state.js                # Shared mutable browser state and formatting helpers
├── renderKeys.js           # Key table, summary, detail panel rendering
├── renderLogs.js           # Request log, trace, and audit rendering
└── renderObservability.js  # Metrics, trends, alerts, config summary rendering
```

Build output is copied to `dist/src/admin-ui/` by `scripts/copy-admin-ui.mjs`. Runtime serving is controlled by `src/admin/static.ts`.

## Module Organization

- Put DOM event wiring and orchestration in `admin.js`.
- Put network calls and admin auth header construction in `api.js`.
- Put formatting, escaping, status derivation, and shared state in `state.js`.
- Put HTML generation for each tab in the matching `render*.js` file.
- Keep `index.html` as the structural contract. JS and tests rely on its ids.

## Naming Conventions

- Static UI assets use lower camel or kebab file names already present in `assetPaths`.
- DOM ids are stable public contracts. Before renaming an id, search `src/admin-ui/`, `test/`, and `src/admin/static.ts`.
- New tab panels use `data-tab-panel="<id>"`; matching navigation buttons use `.nav-item[data-tab="<id>"]`.

## Wrong vs Correct

### Wrong

```text
Add src/admin-ui/chart-widget.js only to index.html.
```

This works in development HTML but fails in production because the static route and copy script do not know the asset.

### Correct

```text
1. Add src/admin-ui/chart-widget.js.
2. Add it to assetPaths in src/admin/static.ts.
3. Add it to assetNames in scripts/copy-admin-ui.mjs.
4. Run npm run build and npm run test:e2e.
```
