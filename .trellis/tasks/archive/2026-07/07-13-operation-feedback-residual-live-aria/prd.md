# PRD: Operation feedback residual live aria polish

## Goal
Make key-detail operation-feedback a live status region with aria-label framing outcome + next action (including idle pending state).

## Scope
- `src/admin-ui/renderKeys.js` operationFor idle copy + operation-feedback markup
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y announcement

## Acceptance
1. operation-feedback section has role/status/aria-live and aria-label with next-action.
2. Idle lastOperation copy includes explicit next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
