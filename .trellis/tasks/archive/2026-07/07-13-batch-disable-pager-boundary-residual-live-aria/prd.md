# PRD: Batch disable pager boundary residual live aria polish

## Goal
Strengthen residual batch-disable and key-pager boundary/active aria-labels with explicit next-action guidance.

## Scope
- `src/admin-ui/index.html` batchDisableProblems/Selected, prevKeyPage
- `src/admin-ui/renderKeys.js` prev/next page dynamic labels
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Disable-batch buttons include follow-up next-action after audit mention.
2. Prev/next page labels include recovery/follow-up next-action in boundary and active states.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
