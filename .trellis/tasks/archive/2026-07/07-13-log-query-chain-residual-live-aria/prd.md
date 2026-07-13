# PRD: Log query chain residual live aria polish

## Goal
1. Add next-action aria-label to request-log query cells (beyond bare title tooltip).
2. Label empty key-chain placeholders with next-action guidance.

## Scope
- `src/admin-ui/renderLogs.js` log-query cell + keyChainMarkup empty state
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- Keep existing log-key-link button labels

## Acceptance
1. log-query has aria-label with query value + next action.
2. Empty key chain returns labeled placeholder with next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
