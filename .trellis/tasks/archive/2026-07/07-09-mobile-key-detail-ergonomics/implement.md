# Implementation Plan

1. Read frontend specs and current Admin Console implementation before editing.
2. Add the mobile inline detail panel to `src/admin-ui/index.html` inside the keys tab.
3. Refactor `renderDetails()` to render shared markup into desktop and mobile detail bodies.
4. Add responsive CSS for the mobile detail panel, stable spacing, and desktop hiding.
5. Wire delegated detail actions for the new mobile detail body and scroll mobile selections into view.
6. Add static tests for the new UI contract and update Playwright mobile coverage.
7. Run lint, focused tests, E2E, full tests, build, verify, and `git diff --check`.
8. Update frontend spec if the shared desktop/mobile detail pattern should persist.
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

- Revert `index.html`, `admin.css`, `admin.js`, `renderKeys.js`, and tests if mobile detail rendering introduces regressions.
