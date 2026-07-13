# PRD: Toast lastOperation residual next-action polish

## Goal
Tighten residual toast and lastOperation copy so outcome always ends with an explicit next action (audit empty open-keys; key enable/disable/reset/test/copy detail messages).

## Scope
- `src/admin-ui/admin.js` toast + lastOperation strings for key actions and audit empty open-keys
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No focus timing changes in this unit

## Acceptance
1. Residual messages include clear next-action guidance after outcome.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
