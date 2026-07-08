# Admin dialog focus polish

## Goal

Make the Admin Console import dialog behave like a polished modal for keyboard users: focus should enter predictably, stay inside the dialog while open, and return to the opener when the dialog closes.

## Confirmed Facts

- The Admin Console is a static vanilla HTML/CSS/ES module UI under `src/admin-ui/`.
- The import dialog already uses `role="dialog"`, `aria-modal="true"`, visible focus states, Escape close, backdrop close, and initial focus on the textarea.
- The current dialog lifecycle does not remember the opener and does not trap Tab/Shift+Tab within the modal.
- The dialog can open from `#bulkImportBtn` or the first-run empty-state import button.

## Requirements

- Keep the implementation CSP-compatible and dependency-free.
- Preserve existing DOM ids, text labels, and import preview behavior.
- When the import dialog opens, remember the focused opener if it is a document element.
- While the import dialog is open, keep Tab and Shift+Tab focus movement inside enabled, visible dialog controls.
- Escape, cancel, close button, backdrop click, and successful import should close the dialog through the same lifecycle.
- When the dialog closes, return focus to the opener if it is still connected and focusable; otherwise avoid throwing.
- Do not trap focus while the dialog is closed.

## Acceptance Criteria

- [ ] Opening from `#bulkImportBtn` focuses the textarea.
- [ ] Shift+Tab from the textarea wraps to the last enabled dialog control.
- [ ] Tab from the last enabled dialog control wraps to the first dialog control.
- [ ] Escape closes the dialog and returns focus to `#bulkImportBtn`.
- [ ] First-run empty-state import still opens the same dialog.
- [ ] Playwright covers the keyboard focus path.
- [ ] `npm run lint`, focused admin tests, `npm run test:e2e`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` pass.

## Notes

- Lightweight frontend task; PRD-only is sufficient.
