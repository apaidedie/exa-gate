# PRD: Admin UI B3 Module Split (R1)

**Parent:** `07-14-project-full-cleanup`  
**Order:** Third child. Requires Phase A + C complete.

## Goal

Aggressively modularize oversized Admin UI (and optionally SQLite state) sources via leaf-first extraction, with **zero intentional product behavior change** (R1).

## Locked decisions

- B3 aggressive split
- R1 behavior freeze (DOM, copy, visuals, API)
- T1 leaf-first extraction order

## Requirements

1. Extract from `admin.js` into modules under `ui/`, `session/`, `live/`, `command/`, `keys/`, `logs/`, `audit/`, `nav/` per parent design.
2. Leave `admin.js` as thin orchestrator (target &lt; ~600 LOC).
3. CSS: modularize without visual change; keep `static.ts` + `copy-admin-ui.mjs` consistent.
4. Optional: split `state.ts` by domain behind stable `createStateStore` facade.
5. Update imports, asset lists, and any relative paths.
6. Atomic commit per extraction package; run gates frequently.
7. Preserve all Playwright / qa script selectors and flows.

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| B-AC1 | Target module tree present; `admin.js` is orchestration-thin |
| B-AC2 | R1 freeze: no intentional DOM id / copy / API JSON changes |
| B-AC3 | `npm run verify` green |
| B-AC4 | `npm run test:e2e` green |
| B-AC5 | If CSS multi-file: assets registered in static + copy script |
| B-AC6 | If state split: app still imports `createStateStore` from `./state.js`; tests green |

## Out of Scope

- Further product polish
- Framework/bundler introduction (default)
- Full `renderKeys.js` mega-split (follow-up if still huge)

## Dependencies

- Phase A: no dirty CSS/code noise
- Phase C: directory-structure documents the tree being implemented
