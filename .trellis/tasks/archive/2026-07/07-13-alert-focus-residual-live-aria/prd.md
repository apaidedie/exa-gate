# PRD: Alert focus residual live aria polish

## Goal
Harden overview alert focus restore after re-render to match row/detail focus (longer intent window + double rAF + short retry).

## Scope
- `src/admin-ui/admin.js` focusAlertTarget
- `src/admin-ui/renderObservability.js` alert list re-focus after render
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond focus restore

## Acceptance
1. alertFocusUntil uses 3200ms window.
2. focusAlertTarget and post-render re-focus use double rAF + short retry.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
