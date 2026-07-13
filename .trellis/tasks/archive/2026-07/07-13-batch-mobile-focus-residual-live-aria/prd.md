# PRD: Batch mobile focus residual live aria polish

## Goal
Harden remaining single-rAF focus restores for batch bar focus, key search scope focus, and mobile details close return-focus.

## Scope
- `src/admin-ui/admin.js`: runKeyWorkflowAction selected/scope, closeMobileDetailsPanel
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond focus restore timing

## Acceptance
1. Batch bar / key search / mobile close return-focus use double rAF + short retry.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
