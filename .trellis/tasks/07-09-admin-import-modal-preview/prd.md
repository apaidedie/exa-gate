# Admin import modal preview polish

## Goal

Improve the Admin Console bulk import modal so operators can understand what will be submitted before they run an import. The modal should feel deliberate and trustworthy without changing the existing import API contract.

## Confirmed Facts

- The Admin Console is a static vanilla HTML/CSS/ES module UI under `src/admin-ui/`.
- The import modal already supports pasted text, file input, Escape close, backdrop close, and `POST /_proxy/keys/import` with a `{ keys }` payload.
- The current preview only counts non-empty lines, so it does not distinguish importable keys, duplicates, invalid JSON, or malformed weights.
- Prior first-run work routes the zero-key empty state into this same modal.

## Requirements

- Add a live import readiness preview inside the existing modal.
- Parse the existing supported formats: `key_value`, `id:key_value`, `id:key_value:weight`, and one JSON object per line.
- Keep the server API payload shape unchanged: submit only parsed key objects in `{ keys }`.
- Disable the confirm action until at least one importable key is present and while an import is pending.
- Surface concise operator copy for importable lines, duplicate lines, invalid lines, and empty input.
- Keep the implementation static and CSP-compatible: no new frontend framework, component library, external font, CDN asset, or inline event handler.
- Preserve existing DOM ids used by browser code and tests.
- Keep the modal responsive at mobile and desktop widths, with visible focus and disabled states.

## Acceptance Criteria

- [ ] Empty input shows a neutral ready state and keeps `#confirmImport` disabled.
- [ ] Pasting valid lines updates the preview with an importable count and enables `#confirmImport`.
- [ ] Duplicate import values are detected client-side and submitted only once.
- [ ] Invalid lines are reported in the preview and are not submitted.
- [ ] Invalid JSON object lines are reported as invalid instead of being submitted as raw key strings.
- [ ] File import still populates the textarea and refreshes the same preview.
- [ ] Playwright covers the visible modal flow for valid, duplicate, and invalid pasted lines.
- [ ] `npm run lint`, focused admin tests, E2E tests, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` pass before archive.

## Notes

- UI brief: expert operators, operational SaaS console, primary workflow is safe key import. Source of truth is the existing token-driven dark admin UI and Trellis frontend specs.
- Art direction: dense but calm, restrained technical surfaces, semantic green/amber/red status language, no decorative assets.
