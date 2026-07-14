# PRD: Search demo logout residual live aria polish

## Goal
Strengthen residual next-action aria for key/log/audit search inputs, fillDemoToken, and logout.

## Scope
- `src/admin-ui/index.html` keySearch, logSearch, auditSearch, fillDemoToken, logout
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Search inputs include follow-up next-action beyond “type to filter”.
2. fillDemoToken / logout include clearer follow-up next-action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
