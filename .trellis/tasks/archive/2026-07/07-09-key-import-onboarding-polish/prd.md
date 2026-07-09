# Polish key import onboarding

## Goal

Make the Admin Console key-import flow feel safer, clearer, and more polished for first-time operators without changing the server-side import API.

## Background

- The key pool is the main operational workflow and the first-run empty state already points operators to bulk import.
- The current import modal works, validates line formats, skips duplicate ids/values, supports file input, traps focus, and returns focus on close.
- The current modal is visually functional but dense: the format guidance is a paragraph, the drop/file affordance is plain, and the preview issues do not show enough hierarchy for quick correction.
- The project UI direction is a compact operational SaaS/data product: dense but calm, restrained color, clear status language, and stable responsive controls.

## Requirements

- Improve the import modal layout and copy so valid formats, file import, and preview outcomes are easier to scan.
- Add a visible drop zone around the file import path while preserving the existing `#importFileButton` and `#importFileInput` ids.
- Support drag-and-drop text/CSV/JSON files into the modal drop zone using the same FileReader path as the existing file picker.
- Keep the submitted payload derived from `buildImportPreview()`; do not create a second parser.
- Keep focus trap, Escape close, disabled submit state, duplicate/invalid issue handling, and toast behavior intact.
- Keep mobile modal layout usable at 390px width without document-level horizontal overflow.
- Preserve static frontend constraints: no new dependencies, no external assets, no inline scripts/styles.

## Acceptance Criteria

- [x] `index.html` presents structured import format guidance and a drop zone while preserving import modal ids and accessible dialog wiring.
- [x] `admin.js` handles file picker and drop-zone files through one shared file-loading function, updates the filename/status text, and rejects unsupported drops with a warning toast.
- [x] `admin.css` adds token-driven import modal/drop-zone/preview polish with stable mobile layout and no layout-shifting hover states.
- [x] Static tests assert the new import structure, shared file-loading function, and no duplicate parser/submission path.
- [x] Playwright covers keyboard focus, drag/drop import, preview counts/issues, submit behavior, and first-run empty import entry.
- [x] Rendered QA checks desktop `1440x960` and mobile `390x844` for modal fit, hit targets, and `overflowX <= 1`.
- [x] `npx vitest run test/admin.test.ts`, `npm run test:e2e`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass.

## Out Of Scope

- Changing backend import validation or API response shape.
- Adding CSV dialect parsing beyond the existing line-based text parsing.
- Adding persistent import history.
- Replacing the existing modal implementation with a framework component.
