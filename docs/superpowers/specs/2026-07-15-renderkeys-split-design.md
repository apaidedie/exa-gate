# Design: Split `renderKeys.js` by UI domain

**Date:** 2026-07-15  
**Status:** Approved approach (user: C + 方案 1; no Trellis task)  
**Constraint:** R1 behavior freeze (DOM ids, `data-*`, copy, visuals, API JSON)

## Goal

Aggressively modularize `src/admin-ui/renderKeys.js` (~1028 LOC) into UI-domain modules while keeping a stable public import surface at `./renderKeys.js`.

## Non-goals

- Product UX / copy / visual changes
- Splitting `renderLogs.js` or `renderObservability.js` in this pass
- Framework or bundler introduction
- Renaming exported function names

## Public API (stable)

Callers keep importing from `renderKeys.js`:

| Export | Owner module (after split) |
|--------|----------------------------|
| `updateSummary` | `keys/render-summary.js` |
| `renderKeys` | `keys/render-table.js` |
| `showKeyOnCurrentPage` | `keys/render-table.js` |
| `syncSelectAllKeysControl` | `keys/render-table.js` |
| `syncSecretToggleState` | `keys/render-table.js` (or small helper re-exported via table) |
| `updateKeyWorkflowSelection` | `keys/render-workflow.js` |
| `renderDetails` | `keys/render-details.js` |

Internal helpers move with their domain and are not part of the public contract.

## Target layout

```text
src/admin-ui/
├── renderKeys.js              # Barrel: re-export public API only
└── keys/
    ├── render-summary.js      # Overview: metrics strip, activity rail, proxy flow, insights
    ├── render-table.js        # Key table: filters, sort, empty states, pager, select-all
    ├── render-workflow.js     # Key workflow summary bar / chip actions display state
    └── render-details.js      # Detail panels (desktop + mobile), focus restore helpers
```

Existing `keys/actions.js`, `keys/import.js`, `keys/ops.js` stay as action/orchestration modules. They continue to import public render APIs from `../renderKeys.js` (or may later import domain files if needed without cycles).

## Dependency rules

- Domain modules must not import `admin.js` or `boot/bindings.js`.
- Prefer `state.js`, `api.js` (if already used), and `ui/*` helpers.
- **No cycles** among `render-summary` / `render-table` / `render-workflow` / `render-details`.
  - If table needs workflow UI refresh after selection changes, call a function exported from `render-workflow` only (workflow must not import table).
  - If summary needs key aggregates only, use `state` + pure helpers already in `state.js` or local pure functions—do not call `renderKeys()` from summary.
- `renderKeys.js` is a pure re-export barrel (plus no logic beyond re-exports).

## Extraction order (leaf-first)

1. **`render-details.js`** — detail markup, mobile panel, row/detail focus sync; export `renderDetails` and any helpers only used by details.
2. **`render-workflow.js`** — `updateKeyWorkflowSelection` and workflow summary rendering helpers.
3. **`render-summary.js`** — `updateSummary` and overview-only render helpers (ops strip, activity rail, proxy flow map, insights).
4. **`render-table.js`** — remaining table/filter/sort/empty/pager/`renderKeys` / `showKeyOnCurrentPage` / select-all / secret toggle.
5. **Barrel + pipeline** — slim `renderKeys.js`; register new assets in:
   - `src/admin/static.ts` (`assetPaths`)
   - `scripts/copy-admin-ui.mjs` (`assetNames`)
   - `test/admin.test.ts` (`jsSource` list / any path assertions)

Atomic commits per extraction package preferred.

## Static asset pipeline

Same rules as B3:

1. File under `src/admin-ui/`
2. Reachable from the ES module graph of a registered entry (`admin.js` → … → `renderKeys.js` → domain modules)
3. Listed in `static.ts` and `copy-admin-ui.mjs`
4. `npm run build` must copy nested paths (`keys/render-*.js`)

Versioned import rewrites already apply to `.js` relative imports in `transformAssetBody`.

## Testing / gates

After each package:

- `npm test -- test/admin.test.ts` (or full `npm test` if preferred)
- Syntax: avoid invalid ESM (`export async`, never `async export`)

End of work:

- `npm run verify`
- `npm run test:e2e`

Tests that scan UI bundle strings for function names remain green because domain files are included in the joined `jsSource` list.

## Acceptance criteria

| ID | Criterion |
|----|-----------|
| RK1 | Four domain modules exist; `renderKeys.js` is primarily re-exports |
| RK2 | Existing import paths (`./renderKeys.js` / `../renderKeys.js`) unchanged |
| RK3 | R1 freeze: no intentional DOM/copy/API changes |
| RK4 | `npm run verify` and `npm run test:e2e` green |
| RK5 | New modules registered in static + copy + admin UI bundle test list |
| RK6 | No circular imports among domain modules |

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Accidental behavior change in markup strings | Move code verbatim; no “cleanup” renames |
| Circular imports between table and workflow | One-way dependency: table → workflow only |
| Missing asset registration | Checklist after each new file; e2e catches 404 module load |
| Invalid ESM after mechanical extract | `node --check` on touched files |

## Rollback

`git revert` the last package commit; do not force-push shared history.

## Out of scope follow-ups

- Further split of `renderLogs.js` / `renderObservability.js`
- CSS changes
- Product polish
