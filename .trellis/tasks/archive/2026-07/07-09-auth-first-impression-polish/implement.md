# Implementation Plan

## Steps

1. Read frontend specs, auth markup/styles, and login e2e/static tests.
2. Add auth summary markup to `src/admin-ui/index.html`.
3. Extend `src/admin-ui/admin.css` with stable responsive auth summary styles.
4. Update tests for new summary copy and rendered behavior.
5. Add task-local rendered QA for desktop/mobile login screen fit and interaction states.
6. Run focused tests, rendered QA, `git diff --check`, and full project verification.
7. Commit, archive task, and record journal.

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

- `test/e2e/admin-console.spec.ts` already asserts demo fill, overflow, and login focus behavior.
- Auth copy appears in static bundle string assertions; keep wording stable and intentional.
- Avoid changing `#loginToken`, `#loginButton`, `#fillDemoToken`, `#authHintStatus`, or `#loginError` ids.

