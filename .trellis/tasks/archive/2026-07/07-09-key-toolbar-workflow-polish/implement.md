# Implementation Plan

## Steps

1. Read frontend specs and key table render/tests.
2. Add `#keyWorkflowSummary` markup to the key panel.
3. Add responsive summary styles to `admin.css`.
4. Update `renderKeys()` to populate visible, selected, problem, and scope cells from existing state.
5. Update static/e2e tests for summary render and dynamic updates.
6. Add task-local rendered QA for desktop/mobile key toolbar layout.
7. Run focused tests, rendered QA, `git diff --check`, and full project verification.
8. Commit, archive task, and record journal.

## Validation Commands

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- task-local rendered QA script against `npm run demo:ui`
- `git diff --check`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify`

## Risk Notes

- `renderKeys()` already owns filtered/page state; avoid duplicating filter logic outside that path.
- Existing e2e selectors depend on key table ids and labels; preserve them.
- If summary uses `innerHTML`, all dynamic search/filter text must be escaped.

