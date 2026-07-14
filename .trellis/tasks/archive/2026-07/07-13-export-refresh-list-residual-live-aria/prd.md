# PRD: Export refresh list residual live aria polish

## Goal
Strengthen residual next-action aria for log/audit export and list refresh controls with explicit follow-up after download/reload.

## Scope
- `src/admin-ui/index.html` exportLogs, exportAudit, applyLogFilters, refreshAuditList
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Export controls include follow-up next-action after offline review mention.
2. List refresh controls include follow-up next-action beyond reload-only phrasing.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
