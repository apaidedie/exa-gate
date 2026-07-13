# PRD: Command empty clear residual live aria polish

## Goal
Strengthen command-palette empty clear-search aria-label with explicit next-action after restore-all-commands mention.

## Scope
- `src/admin-ui/index.html` command empty clear-search
- `test/admin.test.ts` string pins if present

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. clear-search empty action includes next-action after recovery.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
