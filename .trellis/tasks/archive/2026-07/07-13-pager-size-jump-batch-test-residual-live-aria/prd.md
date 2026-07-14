# PRD: Pager size jump batch test residual live aria polish

## Goal
Strengthen residual key page-size / jump-to-page and batch-test aria-labels with explicit follow-up next-action guidance, aligned with prev/next and enable/disable polish.

## Scope
- `src/admin-ui/index.html` keyPageSize, jumpKeyPage, batchTestPage, batchTestSelected
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. keyPageSize / jumpKeyPage include next-action beyond pure instruction.
2. batchTestPage / batchTestSelected include follow-up next-action after audit mention.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
