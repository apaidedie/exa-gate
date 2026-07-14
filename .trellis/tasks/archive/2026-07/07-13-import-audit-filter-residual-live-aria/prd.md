# PRD: Import audit filter residual live aria polish

## Goal
Strengthen residual next-action aria for import file controls and audit action/outcome filters.

## Scope
- `src/admin-ui/index.html` importDropzone, importFileButton, auditActionFilter, auditOutcomeFilter
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Import dropzone/file button include follow-up next-action after file selection guidance.
2. Audit action/outcome filters include follow-up next-action after selection guidance.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
