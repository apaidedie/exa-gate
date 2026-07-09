# Implementation Plan

## Steps

1. Add audit evidence and config evidence placeholders to the audit/config tab.
2. Extend `renderLogs.js` with audit evidence summary helpers and keep row rendering escaped.
3. Extend `renderObservability.js` with config posture helpers and evidence rendering.
4. Update CSS for evidence strips, config posture cells, row hierarchy, and mobile layout.
5. Update static and E2E assertions for new evidence copy and stable ids.
6. Add task-local rendered QA for desktop and mobile audit/config checks.
7. Run focused tests, rendered QA, full verification, commit, archive, and journal.

## Validation Commands

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- Rendered QA script in this task directory
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm run verify`

## Risk Points

- Audit rows are loaded with a limit of 12, so evidence summary copy must say loaded/reviewed events rather than full history.
- Long actor ids, target ids, paths, and upstream URLs can overflow compact cells; CSS must constrain and wrap/truncate intentionally.
- Config data is sanitized by the backend; UI must not imply raw secret visibility.
- Mobile stacked layout can create hidden overflow if config URLs or audit details are not constrained.

## Review Gates

- Before coding: frontend specs and UI QA references are read.
- Before full verification: focused static/e2e tests and rendered QA pass.
- Before archive: `npm run verify` passes and spec-update need is reviewed.
