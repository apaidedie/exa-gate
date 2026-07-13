# PRD: Static idle batch pager residual live aria polish

## Goal
Strengthen remaining thin static/dynamic aria-labels for idle diag path/chain, default next-page button, and batch enable action.

## Scope
- `src/admin-ui/index.html` latestPath/latestChain idle, nextKeyPage, batchEnableSelected
- `src/admin-ui/renderKeys.js` latestPath/latestChain dynamic idle next-action
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Idle path/chain labels include explicit next action with 可.
2. nextKeyPage and batchEnableSelected include clearer next-action guidance.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
