# PRD: Detail cooldown residual live aria polish

## Goal
Make key-detail cooldown diagnostic card a polite live region with outcome + next-action aria (active cooldown vs idle).

## Scope
- `src/admin-ui/renderKeys.js` cooldown-card markup
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. cooldown-card has role/status/aria-live and aria-label with state/reason/remaining + next action.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
