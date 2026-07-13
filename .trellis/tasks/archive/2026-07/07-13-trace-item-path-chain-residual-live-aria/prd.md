# PRD: Trace item path chain residual live aria polish

## Goal
1. Label each trace-item method/path span with next-action guidance.
2. Label trace-summary key-chain strip with next-action guidance.

## Scope
- `src/admin-ui/renderLogs.js` trace-item-main path + trace-chain
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. trace-item method/path has aria-label with next action.
2. trace-chain has aria-label with key chain + next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
