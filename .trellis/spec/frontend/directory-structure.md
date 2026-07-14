# Frontend Directory Structure

## Overview

The Admin Console is intentionally static and CSP-compatible. All browser source lives in `src/admin-ui/`; no generated frontend source should be committed outside that directory.

After the B3 module split, `admin.js` is a thin orchestrator. Feature logic lives in domain modules. **R1 rule**: do not rename DOM ids or `data-*` hooks while moving code.

## Directory Layout

```text
src/admin-ui/
├── index.html                 # Static shell, stable ids, ARIA structure, copy
├── admin.css                  # Entry stylesheet (may be sectioned or multi-file if static pipeline lists all assets)
├── admin.js                   # Boot, event wiring, tab/refresh orchestration only
├── api.js                     # Fetch/session/export helpers
├── state.js                   # Shared mutable browser state and formatting helpers
├── renderKeys.js              # Key table, summary, detail panel rendering
├── renderLogs.js              # Request log, trace, and audit rendering
├── renderObservability.js     # Metrics, trends, alerts, config summary rendering
├── ui/
│   ├── toast.js               # Toasts and next-step copy
│   ├── busy.js                # Button pending/busy affordances
│   ├── focus.js               # Deferred focus helpers
│   └── confirm-action.js      # Destructive confirm modal focus trap
├── session/
│   └── auth-ui.js             # Login/logout/session-expired UI
├── live/
│   ├── refresh.js             # Refresh status, recovery panel, last-updated
│   └── events.js              # SSE event stream
├── command/
│   └── palette.js             # Command palette
├── keys/
│   └── actions.js             # Key filters, workflow, batch selection actions
├── logs/
│   └── actions.js             # Log filters, diagnostics, trace loaders
├── audit/
│   └── actions.js             # Audit filters and evidence actions
└── nav/
    └── tabs.js                # Tab switch, active panel render dispatch
```

Build output is copied to `dist/src/admin-ui/` by `scripts/copy-admin-ui.mjs`. Runtime serving is controlled by `src/admin/static.ts`.

Until B3 lands, some modules above may still live inside `admin.js`. Prefer the target paths for new extractions.

## Module Organization

- Put boot and top-level event binding in `admin.js` only.
- Put network calls and admin auth header construction in `api.js`.
- Put formatting, escaping, status derivation, and shared mutable state in `state.js`.
- Put HTML generation for each tab in the matching `render*.js` file.
- Put leaf UI helpers under `ui/`; put domain action handlers under `keys/`, `logs/`, `audit/`, `session/`, `live/`, `command/`, `nav/`.
- Domain modules must not import `admin.js`. Cross-domain coordination uses `state.js` or callbacks registered at boot.
- Keep `index.html` as the structural contract. JS and tests rely on its ids.

## Naming Conventions

- Static UI assets use lower camel or kebab file names already present in `assetPaths`.
- DOM ids are stable public contracts. Before renaming an id, search `src/admin-ui/`, `test/`, and `src/admin/static.ts`.
- New tab panels use `data-tab-panel="<id>"`; matching navigation buttons use `.nav-item[data-tab="<id>"]`.
- New JS modules added under `src/admin-ui/**` must be listed in `src/admin/static.ts` and `scripts/copy-admin-ui.mjs` when they are loaded as separate assets (ES module graph loaded from a registered entry is allowed if the entry and all imports are served).

## Asset Registration

Every file the browser fetches must be:

1. Present under `src/admin-ui/`
2. Reachable from a registered entry (`index.html` script/link, or static route)
3. Listed in `assetPaths` (`src/admin/static.ts`) and `assetNames` (`scripts/copy-admin-ui.mjs`) when served as a top-level static path

ES module relative imports require the imported `.js` files to be served at matching URLs (static routes for each file or a directory allowlist — follow the current `static.ts` pattern).

## Wrong vs Correct

### Wrong

```text
Add src/admin-ui/chart-widget.js only to index.html.
```

This works in development HTML but fails in production because the static route and copy script do not know the asset.

### Correct

```text
1. Add src/admin-ui/chart-widget.js (or a domain module under keys/, ui/, …).
2. Add it to assetPaths in src/admin/static.ts (and any parent import graph).
3. Add it to assetNames in scripts/copy-admin-ui.mjs.
4. Run npm run build and npm run test:e2e.
```
