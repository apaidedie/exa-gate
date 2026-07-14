# PRD: Login token refresh interval residual live aria polish

## Goal
Strengthen residual next-action aria for login token visibility toggle and refresh-interval select (static + live sync).

## Scope
- `src/admin-ui/index.html` toggleLoginToken, refreshInterval
- `src/admin-ui/admin.js` toggleLoginToken click handler
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Login token visibility toggle aria includes follow-up next-action in both states.
2. refreshInterval aria includes follow-up next-action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
