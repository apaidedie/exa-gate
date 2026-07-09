# Implementation Plan

## Steps

1. Read the frontend specs and import-related code/tests.
2. Add the modal readiness/onboarding markup in `src/admin-ui/index.html`.
3. Extend `src/admin-ui/admin.css` with responsive, token-driven import onboarding and preview styles.
4. Update `src/admin-ui/admin.js` preview rendering so the empty/ready/warning states expose a clear recommendation line while keeping submit payload derived from the preview.
5. Update static and e2e assertions for new UI signatures.
6. Add a task-local rendered QA script for desktop and mobile import modal checks.
7. Run focused tests, rendered QA, `git diff --check`, and full project verification.
8. Commit, archive the task, and record the journal entry.

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

- `test/e2e/admin-console.spec.ts` depends on exact focus behavior and visible copy in the import modal.
- `test/admin.test.ts` uses bundle string assertions; add new assertions carefully and keep existing hooks intact.
- Any text inserted through `innerHTML` in preview rendering must use `esc()` for non-static/user-derived content.

