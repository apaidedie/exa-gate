# PRD: Trace item head residual live aria polish

## Goal
1. Label missing-trace head (0 records) with next-action guidance.
2. Label each trace-item timestamp with next-action guidance.

## Scope
- `src/admin-ui/renderLogs.js` renderLogTrace missing head + trace-item time
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Missing trace-head has aria-label with next action.
2. Trace-item time span has aria-label with next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
