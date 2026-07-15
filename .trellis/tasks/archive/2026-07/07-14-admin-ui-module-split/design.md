# Design: Admin UI B3 Module Split

See parent `07-14-project-full-cleanup/design.md` § Phase B3 for full tree, order, CSS options, and state split.

## Extraction packages (commit units)

| # | Package | Primary source moves |
|---|---------|----------------------|
| 1 | `ui/toast.js` + `ui/busy.js` | toast, error toast, button pending/busy |
| 2 | `ui/focus.js` + `ui/confirm-action.js` | focus helpers, confirm modal trap |
| 3 | `session/auth-ui.js` | login/logout/session-expired/caps |
| 4 | `live/refresh.js` + `live/events.js` | refresh status/recovery, SSE |
| 5 | `command/palette.js` | command palette open/close/render/nav |
| 6 | `nav/tabs.js` | switchTab, renderActiveTab, focus helpers |
| 7 | `keys/actions.js` | key filters, workflow, batch bar hooks |
| 8 | `logs/actions.js` + `audit/actions.js` | log/audit filter & evidence actions |
| 9 | CSS modularization or section pass | pipeline-safe |
| 10 | Optional `src/state/*` domain split | facade stable |

## Dependency rule

Lower packages must not import `admin.js`. `admin.js` imports children. Cross-domain calls go through `state.js` or small callbacks registered at boot.

## Test plan

- After packages 1–2: unit/lint via `npm run verify` if pure moves
- After packages 3–8: prefer `npm run test:e2e` at least once mid-way and at end
- After CSS/static changes: always `npm run build` + e2e
