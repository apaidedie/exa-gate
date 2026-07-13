# PRD: Detail usage signal title residual live aria polish

## Goal
1. Align key-row signal title tooltip with aria next-action guidance.
2. Make key-detail usage KPI band a polite live region summarizing rates + next action.

## Scope
- `src/admin-ui/renderKeys.js` key-row-signal title + detail-usage markup
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. key-row-signal title includes next-action (same family as aria-label).
2. detail-usage has role/status/aria-live and aria-label with summary + next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
