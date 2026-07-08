# Admin import file button focus

## Goal

Remove the invisible file input from the import dialog keyboard path while preserving file import behavior.

## Confirmed Facts

- The import dialog now traps Tab/Shift+Tab and returns focus to the opener.
- A rendered keyboard sanity check showed the visually hidden `#importFileInput` still receives focus after the textarea.
- The visible file import affordance is currently a `<label>` styled as a button, not a real button.

## Requirements

- Keep `#importFileInput` for browser file selection and existing change handling.
- Move keyboard focus to a visible import-file control instead of the hidden input.
- Preserve the existing file selection behavior and filename display.
- Keep the implementation dependency-free and CSP-compatible.
- Preserve import modal copy and preview behavior.

## Acceptance Criteria

- [ ] Tab from `#importTextarea` focuses a visible file import button, not `#importFileInput`.
- [ ] Activating the visible file import button triggers the hidden file input.
- [ ] The hidden file input is removed from the sequential tab order.
- [ ] Existing pasted import, file input change handling, Escape close, and focus return still work.
- [ ] Playwright covers the keyboard order through the visible file import button.
- [ ] `npm run lint`, focused admin tests, `npm run test:e2e`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` pass.

## Notes

- Lightweight follow-up to the dialog focus polish task; PRD-only is sufficient.
