# Frontend Directory Structure

## Overview

The Admin Console is intentionally static and CSP-compatible. All browser source lives in `src/admin-ui/`; no generated frontend source should be committed outside that directory.

After the B3 module split, `admin.js` is a thin orchestrator. Feature logic lives in domain modules. **R1 rule**: do not rename DOM ids or `data-*` hooks while moving code.

## Directory Layout

```text
src/admin-ui/
├── index.html                 # Static shell, stable ids, ARIA structure, copy
├── admin.css                  # Entry stylesheet (@import css/* sections)
├── admin.js                   # Thin orchestrator: deps, refresh, session boot
├── api.js                     # Fetch/session/export helpers
├── state.js                   # Shared mutable browser state and formatting helpers
├── renderKeys.js              # Barrel: re-exports key render public API
├── renderLogs.js              # Barrel: re-exports logs/audit render public API
├── renderObservability.js     # Barrel: re-exports overview metrics/config render
├── css/
│   ├── tokens.css             # :root tokens and base reset
│   ├── login.css              # Auth/login screen
│   ├── shell.css              # Console shell / nav chrome
│   ├── controls.css           # Shared controls
│   ├── overview.css           # Overview tab
│   ├── panels.css             # Panels and tables
│   ├── observability.css      # Logs / audit / observability
│   ├── details.css            # Key detail panel
│   ├── modals.css             # Modal, toast, batch bar
│   └── responsive.css         # Breakpoints and touch densify
├── boot/
│   ├── bindings.js            # bindConsoleEvents orchestrator
│   ├── bind-session.js        # login/logout/refresh/webhook
│   ├── bind-logs.js           # log filters/trace clicks
│   ├── bind-keys.js           # key table/batch/pager
│   ├── bind-audit.js          # audit filters/evidence
│   ├── bind-import.js         # import + confirm modals
│   ├── bind-command.js        # command palette
│   └── bind-shell.js          # tabs, sidebar, keyboard traps, resize
├── ui/
│   ├── toast.js
│   ├── busy.js
│   ├── focus.js
│   ├── confirm-action.js
│   └── table-scroll.js
├── session/
│   └── auth-ui.js
├── live/
│   ├── refresh.js
│   └── events.js
├── command/
│   └── palette.js
├── keys/
│   ├── actions.js             # Key filters
│   ├── import.js              # Bulk import modal
│   ├── ops.js                 # Batch/keyAction/pager/workflow
│   ├── render-shared.js       # Pure key-table helpers (sort/scope/signal)
│   ├── render-summary.js      # Overview summary / ops / activity / proxy flow
│   ├── render-workflow.js     # Key workflow summary bar
│   ├── render-table.js        # Key table render + select-all + secret toggle
│   └── render-details.js      # Key detail panels + focus restore
├── logs/
│   ├── actions.js
│   ├── render-shared.js       # Log row helpers + filter chips
│   ├── render-list.js         # renderLogs + diagnostics
│   └── render-trace.js        # renderLogTrace
├── audit/
│   ├── actions.js
│   └── render.js              # renderAudit
├── overview/
│   ├── actions.js
│   ├── render-metrics.js      # trends, alerts, renderObservability
│   └── render-config.js       # config summary + retention
├── console/
│   └── ops.js                 # Prune/webhook/export/sidebar helpers
└── nav/
    └── tabs.js
```

Build output is copied to `dist/src/admin-ui/` by `scripts/copy-admin-ui.mjs`. Runtime serving is controlled by `src/admin/static.ts`.

## Module Organization

- Put factory wiring and `refresh` in `admin.js`; put DOM event listeners in `boot/bindings.js`.
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
