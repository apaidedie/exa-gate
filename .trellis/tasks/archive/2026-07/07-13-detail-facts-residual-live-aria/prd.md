# PRD: Detail facts residual live aria polish

## Goal
Make key-detail facts strip (scheduling / weight / id) a polite live region with outcome + next-action aria.

## Scope
- `src/admin-ui/renderKeys.js` detail-facts markup
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. detail-facts has role/status/aria-live and aria-label with scheduling/weight/id + next action.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
