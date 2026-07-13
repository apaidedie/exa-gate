# PRD: Key page nav residual next-action polish

## Goal
Give key pool prev/next page navigation the same next-action toast + focus restore pattern as jump/page-size, using filtered total pages.

## Scope
- `src/admin-ui/admin.js` prevKeyPage / nextKeyPage handlers
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. prev/next page show next-action toast with page position and restore focus on the control.
2. Boundary pages toast warn with recovery next step.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
