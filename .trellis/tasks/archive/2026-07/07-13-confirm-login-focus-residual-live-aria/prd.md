# PRD: Confirm login focus residual live aria polish

## Goal
Harden remaining immediate focus paths for login screen, demo token CTA, empty-token validation, and confirm-action modal open/return-focus.

## Scope
- `src/admin-ui/admin.js`: showLogin, openConfirmAction, restoreConfirmActionFocus, login form empty token, fillDemoToken
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond focus restore timing
- Leave Tab trap cycle focus immediate (intentional for keyboard loop)

## Acceptance
1. Listed focus paths use scheduleControlFocus / scheduleElementFocus (double rAF + short retry).
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
