# Polish log request link hit targets

## Goal

Improve the Admin Console request log trace entry points so requestId links and recent trace shortcuts are easy to read and click across desktop, narrow desktop, and mobile layouts, without changing log data, filters, export behavior, or trace loading contracts.

## Background

- Fresh rendered audit found request log `.link-btn` elements clipping horizontally on desktop, narrow, and mobile log views.
- The same audit reported overlap risk between visible requestId buttons and `.trace-shortcut` buttons in the idle trace panel.
- The request log table is intentionally horizontally scrollable, but interactive text inside cells should still have stable hit targets and should not visibly clip its own shortened label.
- The Admin Console is a CSP-compatible static HTML/CSS/ES module UI with existing `data-trace-id` delegation for both table requestId links and trace shortcuts.

## Requirements

- Preserve the existing `data-trace-id` event delegation and `fetchLogTrace()` behavior.
- Keep the log table scroll model intact; do not introduce document-level horizontal overflow.
- Give requestId buttons a stable inline hit target that fits the generated shortened requestId label without internal clipping.
- Keep recent trace shortcuts visually separate from log table links in rendered desktop, narrow, and mobile views.
- Use existing CSS variables and static UI patterns; do not add dependencies, icons, fonts, or inline production styles.
- Keep the current Chinese copy and trace interaction behavior unless a copy change is required to prevent clipping.

## Acceptance Criteria

- [ ] Rendered QA shows `.link-btn[data-trace-id]` has no internal horizontal or vertical clipping on desktop, narrow, and mobile log views.
- [ ] Rendered QA shows visible requestId links and `.trace-shortcut` controls do not overlap in desktop, narrow, or mobile log views.
- [ ] The log page has no document-level horizontal overflow at desktop, narrow, or mobile viewport sizes.
- [ ] Existing E2E trace loading through both the log table requestId button and the recent trace shortcut still passes.
- [ ] Static tests pin the requestId link hit-target style so it cannot regress to a zero-padding text button.
- [ ] `npm run verify` passes before archiving.

## Out Of Scope

- Backend/admin API changes.
- Changing log retention, filtering, CSV export, or trace payloads.
- Reworking the entire log table, table columns, or trace panel design.
- Adding a new component framework or animation library.
