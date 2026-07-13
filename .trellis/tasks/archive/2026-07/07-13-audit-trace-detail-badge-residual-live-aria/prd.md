# PRD: Audit trace detail badge residual live aria polish

## Goal
Add next-action aria labels to audit list items/outcome badges, key-detail hero status badge, and trace-item status badges.

## Scope
- `src/admin-ui/renderLogs.js` audit-item + trace-item badges
- `src/admin-ui/renderKeys.js` detail hero status badge
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. audit-item / outcome badge include aria-label with next action.
2. detail hero badge and trace-item badge include aria-label with next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
