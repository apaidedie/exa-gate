# PRD: Bulk import sidebar residual live aria polish

## Goal
Strengthen residual next-action aria for bulk-import open control and sidebar collapse toggle (static + live sync).

## Scope
- `src/admin-ui/index.html` bulkImportBtn, sidebarCollapse
- `src/admin-ui/admin.js` syncSidebarCollapseControl + closeImportModal bulk restore label
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. bulkImportBtn closed-state aria includes follow-up next-action.
2. sidebar collapse/expand aria includes follow-up next-action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
