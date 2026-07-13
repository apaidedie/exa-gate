# PRD: Prune confirm residual live aria polish

## Goal
Strengthen prune-logs and confirm-accept idle aria-labels with explicit next-action after audit mention.

## Scope
- `src/admin-ui/index.html` pruneLogs + confirmActionAccept
- `src/admin-ui/admin.js` closeConfirmAction accept restore label
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- Keep openConfirmAction dynamic accept label behavior

## Acceptance
1. pruneLogs and idle confirm accept include follow-up next-action.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
