# PRD: Diagnostic evidence kicker residual live aria polish

## Goal
1. Hide decorative log-diagnostic and audit-evidence label kickers (`em`) inside fully labeled action buttons.
2. Strengthen idle next-action copy for zero-error / zero-429 / zero-failure diagnostic and evidence states.

## Scope
- `src/admin-ui/index.html` log-diagnostic / audit-evidence em aria-hidden
- `src/admin-ui/renderLogs.js` idle next-action strings
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Diagnostic/evidence label em elements are aria-hidden.
2. Zero-error / zero-429 / zero-failure labels include explicit next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
