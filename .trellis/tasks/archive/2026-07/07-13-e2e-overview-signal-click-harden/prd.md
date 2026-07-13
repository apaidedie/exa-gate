# PRD: E2E overview signal click harden

## Goal
Harden overview-signal action clicks in the long admin e2e flow so auto-refresh re-renders do not leave buttons unstable and time out the 90s suite.

## Scope
- `test/e2e/admin-console.spec.ts` overview signal / next-action click helper

## Non-goals
- No product UI changes
- Preserve navigation assertions after each click

## Acceptance
1. Overview signal clicks re-query and tolerate detach/unstable with force fallback.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
