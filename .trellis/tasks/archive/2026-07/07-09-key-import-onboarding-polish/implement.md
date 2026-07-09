# Implementation Plan

## Checklist

1. Update `index.html` import modal content with structured format examples and a semantic drop zone while preserving existing ids.
2. Add `readImportFile(file)` and import drop-zone event handlers in `admin.js`, reusing `updateImportPreview()` and existing submit parser.
3. Add CSS for format examples, drop-zone states, filename/status text, preview issue hierarchy, and mobile modal constraints.
4. Update `test/admin.test.ts` static assertions for new import structure and shared file ingestion helper.
5. Update `test/e2e/admin-console.spec.ts` to cover drag/drop import and existing keyboard/focus paths.
6. Run targeted tests, rendered QA, then full validation.
7. Mark PRD acceptance complete, commit work, archive task, and record journal.

## Validation Commands

```powershell
npx vitest run test/admin.test.ts
npm run test:e2e
npm run lint
npm test
npm run build
git diff --check
npm run verify
```

## Rendered QA

- Start a real app instance or use Playwright against the test app.
- Check `1440x960` and `390x844` after opening the import modal.
- Confirm no document-level horizontal overflow.
- Confirm textarea, drop zone, preview, cancel, and confirm controls are visible/reachable.
- Confirm drop-zone dragging state does not shift layout.

## Risk Points

- File drag/drop event construction in Playwright can be browser-sensitive; keep coverage focused on observable DOM updates and preview result.
- The hidden file input should stay out of tab order; keyboard flow should still move textarea -> file button -> close/cancel/submit as currently tested.
- Avoid adding a second import parser; tests should continue proving submit derives from `buildImportPreview()`.
