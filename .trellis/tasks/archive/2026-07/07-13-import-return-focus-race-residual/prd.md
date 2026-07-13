# PRD: Import return focus race residual polish

## Goal
Stop import-keys open from racing bulkImportBtn focus against importTextarea, and restore focus only to useful interactive return targets (fallback bulkImportBtn) so Escape after command-palette import reliably lands on bulk import.

## Scope
- `src/admin-ui/admin.js` import-keys command/overview paths + restoreImportFocus
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. import-keys no longer schedules bulkImportBtn focus before openImportModal.
2. restoreImportFocus ignores body/non-interactive return targets.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
