# PRD: Command chip log status residual live aria polish

## Goal
1. Align command palette chip title with aria next-action guidance.
2. Add request-log status badge aria-label with outcome + next action (open trace).

## Scope
- `src/admin-ui/admin.js` command-option-chip title
- `src/admin-ui/renderLogs.js` log status badge
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. command-option-chip title includes next-action (Enter guidance).
2. log status badge has aria-label with next action to open trace.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
