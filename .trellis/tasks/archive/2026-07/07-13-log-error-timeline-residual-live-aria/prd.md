# PRD: Log error timeline residual live aria polish

## Goal
1. Add next-action aria-labels to request-log error-code and token cells.
2. Add next-action aria-labels to key-detail incident timeline items (error/status/time).

## Scope
- `src/admin-ui/renderLogs.js` logs table error/token cells
- `src/admin-ui/renderKeys.js` timeline-item markup
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Log error-code and token cells include aria-label with next action.
2. Detail timeline items include aria-label with next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
