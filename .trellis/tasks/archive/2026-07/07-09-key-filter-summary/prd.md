# Polish key filter summary

## Goal

Make key-pool filtering feel as deliberate and reversible as request-log filtering by adding a compact filter-state summary and one-click clear action to the Admin Console key workflow.

## Background

The request-log tab already gives operators a filter summary, chips, and a clear-filter button. The key-pool tab has search and status chips, plus workflow cards that show scope, but it does not offer the same direct "clear current filter" affordance. When a key search returns zero rows or a non-All status is active, the operator must manually erase the search input and reselect All.

## Requirements

- Add a compact key-filter summary below the existing key workflow summary and above the key table.
- Show a neutral idle state when no search or status filter is active.
- When active, show human-readable filter chips for keyword and status, a visible result count, and a clear action.
- The clear action must reset `#keySearch`, `state.keyFilter`, and `state.keyPage` to the all-keys first-page state, then re-render keys and preserve existing selection/batch behavior as much as the current table contract allows.
- Keep copy concise and operational, matching the existing Chinese console language.
- Keep the implementation static/CSP-compatible: no dependencies, no inline handlers.
- Keep mobile layout compact so the first visible key-table rows remain reachable.

## Acceptance Criteria

- [ ] Key filter summary renders an idle state when showing all keys without search.
- [ ] Applying a keyword search or status chip updates the summary, chips, result count, and clear button visibility.
- [ ] Clicking clear resets search input and status filter to all keys, hides the clear button, and restores visible rows.
- [ ] Zero-result key searches include the active filter summary and a clear path.
- [ ] Static tests cover HTML/CSS/JS contracts.
- [ ] Playwright covers a representative active filter, zero-result state, and clear interaction on the key tab.
- [ ] `npm run lint`, focused admin tests, admin-console E2E, and `npm run verify` pass.

## Out of Scope

- Changing backend key APIs, key sorting semantics, or key data models.
- Replacing the table with cards or changing mobile navigation.
- Adding saved filters, advanced query syntax, or multi-select status filtering.
