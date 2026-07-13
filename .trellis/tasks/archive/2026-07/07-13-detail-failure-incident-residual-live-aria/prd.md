# PRD: Detail failure incident residual live aria polish

## Goal
Make key-detail failure summary and incident ops-alert polite live regions with outcome + next-action aria labels (including idle/pending states).

## Scope
- `src/admin-ui/renderKeys.js` renderFailureSummary + incident ops-alert markup
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. failure-reasons and incident ops-alert include role/status/aria-live and next-action aria-label.
2. Idle/pending/empty failure states include explicit next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
