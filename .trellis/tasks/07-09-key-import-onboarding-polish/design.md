# Design

## Boundaries

- Modify only the static Admin Console import/onboarding surface and tests:
  - `src/admin-ui/index.html`
  - `src/admin-ui/admin.css`
  - `src/admin-ui/admin.js`
  - `test/admin.test.ts`
  - `test/e2e/admin-console.spec.ts`
- Preserve backend routes and import payload shape: `POST /_proxy/keys/import` receives `{ keys }` generated from the existing preview parser.
- Preserve existing modal ids and control ids used by tests and event wiring.

## UI Brief

- Audience: operators configuring a self-hosted proxy, often with a file or pasted list of keys.
- Primary workflow: paste or drop keys, understand what will be imported/skipped, fix obvious line errors, then submit confidently.
- Product archetype: operational SaaS/data product.
- Constraints: vanilla HTML/CSS/ES modules, CSP-safe, no new assets, dark technical art direction, dense mobile shell.
- States: empty, ready, warnings, invalid-only, dragging, unsupported file, pending submit, keyboard focus, mobile.
- Acceptance: static tests, Playwright import flow, desktop/mobile rendered QA, full verification suite.

## Structure

- Replace the single modal hint paragraph with:
  - `.import-format-grid`: three compact format examples (`key_value`, `id:key_value`, `id:key_value:weight`) plus JSON-line support.
  - `.import-dropzone`: a bordered drop/file area containing `#importFileButton`, `#importFileInput`, and `#importFileName`.
  - Keep `#importTextarea` as the main input surface.
- Keep preview rendering in `renderImportPreview()` but add small preview copy classes for clearer issue hierarchy.

## Behavior

- Add `readImportFile(file)` as the single file ingestion helper.
- Existing file picker `change` calls `readImportFile(file)`.
- New drop-zone handlers:
  - `dragenter`/`dragover`: prevent default and add `.is-dragging`.
  - `dragleave`/`drop`: remove `.is-dragging`.
  - `drop`: accept first file with text-like extension/type, then call `readImportFile(file)`; unsupported drops show `showToast(..., 'warn')`.
- Keep submit behavior unchanged: `submitImport()` calls `updateImportPreview()` and posts only the parsed `keys`.

## Responsive Design

- Desktop modal remains centered with stable max height.
- Mobile modal uses most viewport width, keeps textarea and preview scrollable within modal body, and stacks format examples/drop zone cleanly.
- Drop-zone hover/drag states only change border/background/color, not size.

## Compatibility And Rollback

- No database, API, or storage migration.
- Rollback can remove drag/drop handlers and CSS while keeping the current file picker path intact.
