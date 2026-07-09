# Polish key table sortable headers

## Goal

Make the key-pool table's sortable columns feel like deliberate, professional controls by giving them real button semantics, keyboard reachability, and clear sort-state feedback while preserving the compact operations-console layout.

## Requirements

- Replace direct clickable `th.sortable` behavior with visible header buttons inside the sortable cells.
- Preserve existing sort fields, ascending/descending toggle behavior, DOM table structure, and compact visual density.
- Expose current sort state through `aria-sort`, `aria-pressed`, and contextual accessible names.
- Keep the implementation static/CSP-compatible: no dependencies, no framework migration, no inline handlers.
- Ensure keyboard and pointer activation both use the same sorting path.

## Acceptance Criteria

- [ ] Sortable key table headers render real buttons for requests, success, failures, 429, and timeouts.
- [ ] Clicking or keyboard-activating a sort header updates row order and sort state without layout shift.
- [ ] The active sortable column exposes `aria-sort="ascending"` or `aria-sort="descending"`; inactive sortable headers expose `aria-sort="none"`.
- [ ] Static and Playwright tests cover the semantic header contract and a representative sort interaction.
- [ ] `npm run lint`, focused admin tests, admin-console E2E, and `npm run verify` pass.

## Notes

- Lightweight PRD-only task. This is a UI control semantics polish pass, not a data-model or table redesign.
