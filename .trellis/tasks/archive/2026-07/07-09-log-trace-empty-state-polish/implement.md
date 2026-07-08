# Implementation Plan

1. Read task artifacts and frontend specs before editing.
2. Add reusable trace empty-state markup helpers in `renderLogs.js`.
3. Improve log filtered-empty copy and trace no-record rendering.
4. Add CSS for trace empty state, trace meta chips, and mobile wrapping.
5. Extend static tests for markup/classes/copy.
6. Extend Playwright coverage to click a request ID and verify trace content on desktop and mobile.
7. Run lint, focused tests, E2E, full tests, build, verify, rendered QA, and `git diff --check`.
8. Update frontend spec if a reusable empty-state convention should be recorded.
9. Archive task, record journal, stage, and commit.

## Validation Commands

- `npm run lint`
- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- `npm test`
- `npm run build`
- `npm run verify`
- `git diff --check`

## Rollback Points

- Revert `src/admin-ui/renderLogs.js`, `src/admin-ui/admin.css`, and test changes if trace state rendering regresses log flow.
