# Admin semantic toast feedback

## Goal

Make Admin Console toast feedback visually match the outcome being reported so operators can distinguish success, warning, and failure messages at a glance.

## Confirmed Facts

- `showToast(message)` currently sets text and display only.
- `.toast` always uses the green success border, even for failures such as webhook errors, clipboard failures, API errors, and invalid import submission.
- The console already has semantic status tokens: `--green`, `--amber`, and `--red` with matching soft backgrounds.

## Requirements

- Extend the existing toast helper with semantic tones without adding dependencies or changing the single `#toast` DOM contract.
- Support at least `good`, `warn`, and `bad` tones, with `good` as the default for existing success paths.
- Use warning tone for non-fatal blocked actions or policy constraints.
- Use bad tone for failed network/API/clipboard/import/webhook actions and catch-handler errors.
- Keep the toast accessible through the existing `role="status"` and `aria-live="polite"` region.
- Preserve existing toast timing and text content.

## Acceptance Criteria

- [ ] `.toast.good`, `.toast.warn`, and `.toast.bad` have distinct semantic visual styling.
- [ ] `showToast` applies exactly one semantic class for the active message.
- [ ] Failure paths no longer render with the default green success border.
- [ ] The webhook E2E path verifies the toast gets either a good or bad semantic class depending on the result.
- [ ] Static admin tests pin the helper and CSS contract.
- [ ] `npm run lint`, focused admin tests, `npm run test:e2e`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` pass.

## Notes

- Lightweight frontend polish task; PRD-only is sufficient.
