# Implementation Plan

## Steps

- Inspect current mobile CSS around `.topbar`, `.top-actions`, `.mobile-tabs`, `.toolbar`, key filter chips, and panel heads.
- Add targeted mobile CSS for compact topbar, mobile tabs, and key toolbar while preserving the existing `.log-tools` mobile grid.
- Add static tests in `test/admin.test.ts` that assert compact mobile chrome/key-toolbar CSS exists and does not collapse log tools.
- Extend Playwright E2E so 390x844 and 760x844 assert key rows are visible, topbar is below the old 189px baseline, and log controls still hit-test.
- Run rendered QA for 390x844 and 760x844 to record topbar height, key table y-position, visible key rows, visible log rows, and overflow.

## Validation

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify`
- `git diff --check`

## Rollback Notes

Rollback is limited to CSS/test changes in this task. If compact mobile chrome causes hit-target regressions, revert the task commit and keep the prior mobile log-density improvements intact.
