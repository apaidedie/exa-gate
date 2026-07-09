# Polish admin control accessible names

## Goal

Improve the admin console's accessibility and automation stability by giving dense controls explicit, contextual accessible names without changing the current visual layout.

## Requirements

- Add stable accessible names to search/filter/pagination controls that currently rely on placeholders or surrounding copy.
- Add contextual accessible names to rendered key-row controls: row checkboxes, enable toggles, detail/reset/test buttons.
- Add contextual accessible names to request trace entry points in the request log table and recent-request shortcuts.
- Preserve existing selectors, behavior, copy density, CSP/static asset boundaries, and the vanilla HTML/CSS/ES module stack.
- Keep visual layout unchanged except for semantic attributes; no new runtime dependencies.

## Acceptance Criteria

- [ ] Static admin UI assets include explicit labels for key search, log filters, key pagination controls, select-all, and generated row actions.
- [ ] Request log trace buttons expose request-specific accessible names while retaining compact visible labels and titles.
- [ ] Focused unit coverage pins the important static and generated label strings.
- [ ] Playwright coverage can locate representative controls by accessible name on desktop and mobile flows.
- [ ] Project verification passes for lint, focused admin tests, admin console E2E, and `npm run verify`.

## Notes

- Lightweight PRD-only task. This is a semantic UI polish pass, not a layout redesign.
