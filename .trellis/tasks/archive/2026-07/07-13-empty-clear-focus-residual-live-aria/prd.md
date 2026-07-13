# PRD: Empty clear focus residual live aria polish

## Goal
Strengthen residual empty/clear-filter and focus-search action aria-labels with explicit next-action after recovery mention.

## Scope
- `src/admin-ui/renderKeys.js` clear key filters / focus key search empties
- `src/admin-ui/renderLogs.js` clear log/audit filters / focus log search empties
- `src/admin-ui/index.html` matching static empties
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Clear-filter and focus-search empty actions include next-action guidance.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
