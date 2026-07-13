# PRD: Audit failure command em residual live aria polish

## Goal
1. Strengthen auditFailure idle next-action copy (zero failures).
2. Hide decorative command-option-meta `em` chip text inside fully labeled options.

## Scope
- `src/admin-ui/renderLogs.js` auditFailure idle next-action
- `src/admin-ui/admin.js` command option meta em aria-hidden
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. auditFailure idle includes explicit next action.
2. command-option-meta em is aria-hidden.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
