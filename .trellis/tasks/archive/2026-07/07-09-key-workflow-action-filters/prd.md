# Key Workflow Action Filters

## Goal

Make the Key Pool workflow summary actionable so operators can move from visible metrics to the next key-management action without hunting through adjacent controls. The summary should keep the existing compact operations-console style while using semantic controls, stable hit targets, and clear feedback.

## Confirmed Facts

- The Admin Console is a CSP-compatible static HTML/CSS/ES module frontend in `src/admin-ui/`.
- `#keyWorkflowSummary` currently shows four non-interactive `.key-workflow-item` cells: current display, selected keys, problem pressure, and filter scope.
- Existing key filter state is held in `state.keyFilter`, `#keySearch`, `state.keyPage`, and rendered through `renderKeys()`.
- The Request Logs diagnostics summary already uses real diagnostic buttons with disabled, busy, hover, focus, and responsive coverage; this task should mirror that pattern for Key Pool.
- No backend or API contract changes are needed.

## Requirements

- Replace clickable-looking key workflow summary cells with real `button` controls that keep the current labels, counts, and hints.
- Provide four actions:
  - Current display: clear key filters, return to page one, and focus the `All` chip.
  - Selected keys: when selected keys exist, focus the batch action bar; otherwise remain disabled and clearly communicate that selection is required.
  - Problem pressure: apply the existing `Problem` key filter, return to page one, update chips and summary copy, and focus the Problem chip.
  - Filter scope: focus the key search input so the operator can refine the scope.
- Synchronize disabled state, accessible names, and tooltip/title copy whenever key rows, filters, search query, or selection changes.
- Preserve compact desktop density and mobile reachability. Hover, focus, disabled, and busy states must not change layout dimensions.
- Keep the implementation frontend-only and compatible with the existing CSP: no inline handlers, external assets, new dependencies, fonts, or frameworks.

## Acceptance Criteria

- [ ] Key workflow summary items are real buttons with `data-key-workflow-action` hooks and descriptive accessible names.
- [ ] Clicking Problem pressure applies `state.keyFilter = 'Problem'`, resets `state.keyPage = 1`, updates the active filter chip and filter summary, and focuses the Problem chip.
- [ ] Clicking Current display clears key search/status filters, returns the table to all keys, hides the clear-filter action, and focuses the All chip.
- [ ] Clicking Selected keys focuses an actionable batch-bar control only when selected keys exist; the summary action is disabled when there is no selection.
- [ ] Clicking Filter scope focuses `#keySearch` and leaves existing filter state intact.
- [ ] Desktop and mobile Playwright coverage proves the workflow buttons are reachable, unclipped, not covered, and do not create document-level horizontal overflow.
- [ ] Static tests pin the new DOM hooks, JS action handler, and CSS interaction states.
- [ ] `git diff --check`, `npm run lint`, `npx vitest run test/admin.test.ts`, `npx playwright test test/e2e/admin-console.spec.ts`, and `npm run verify` pass.

## Out Of Scope

- Backend/admin API changes.
- New dependencies, icon libraries, fonts, CDN assets, or animation libraries.
- Reworking key import, key detail, or batch API behavior beyond the focus path needed for selected-key workflow actions.

## Notes

- UI brief: operational SaaS/data product for self-hosted proxy operators; primary workflow is quickly isolating key-pool scope, anomalies, and selected-key actions. Source of truth is the existing dark technical console and frontend specs.
