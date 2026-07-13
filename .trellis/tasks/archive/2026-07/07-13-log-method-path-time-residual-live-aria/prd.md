# PRD: Log method path time residual live aria polish

## Goal
Add next-action aria-labels to request-log time, method, and path cells (aligned with status/latency/token/error cells).

## Scope
- `src/admin-ui/renderLogs.js` logs table time/method/path cells
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- Leave log-query title as truncated content tooltip (already has title with full query)

## Acceptance
1. Time/method/path cells include aria-label with value + next action.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
