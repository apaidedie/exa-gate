# Log Diagnostics Action Filters

## Goal

Make the Request Logs diagnostic summary directly actionable, so operators can click the visible issue signal and immediately narrow the log table without manually recreating the filter.

## Background

The logs tab already shows a compact diagnostic strip for visible logs, anomalies, 429 pressure, and slowest request. Those cells are useful for scanning, but they are passive. The table already has supported filters for keyword, path, key, and status, and `admin.js` already owns the async reload path for server-backed filters. A high-polish operations console should shorten the path from "spot signal" to "inspect matching rows" while preserving the dense static UI.

Confirmed implementation facts:

- The Admin Console is static vanilla HTML/CSS/ES modules in `src/admin-ui/`.
- `renderLogs.js` computes log diagnostic counts and renders the request table, trace shortcuts, and filter summaries.
- `admin.js` wires log filters through existing inputs/selects and `reloadLogs()`.
- Status filtering is server-backed through `#logStatusFilter`; keyword filtering is client-side through `#logSearch`.
- Existing Playwright coverage verifies log filters, trace shortcuts, mobile reachability, and no document-level horizontal overflow.

## Requirements

- Turn the log diagnostics summary cells into real buttons or button-contained controls, not clickable `div` elements.
- Provide clear action labels for at least:
  - visible logs: reset log filters to the full recent window;
  - anomalies: filter logs to error records;
  - 429 pressure: filter logs to status `429`;
  - slowest request: focus the slowest path as a keyword/path investigation aid when a slowest sample exists.
- Reuse existing filter controls and `reloadLogs()` behavior; do not add backend endpoints or duplicate fetch logic.
- Keep diagnostic cells visually compact, stable, token-driven, and consistent with the dark operational console.
- Maintain keyboard accessibility, visible focus, accessible names, and no layout-shifting hover/focus states.
- Preserve mobile layout and no document-level horizontal overflow at 390px.

## Acceptance Criteria

- [ ] Log diagnostics render as accessible controls with stable dimensions.
- [ ] Clicking the anomaly diagnostic applies the existing error/status filtering path and keeps the logs tab active.
- [ ] Clicking the 429 diagnostic applies the existing `429` status filter and updates filter summary chips.
- [ ] Clicking the visible-count/reset diagnostic clears log filters and restores the idle filter summary.
- [ ] Clicking the slowest diagnostic focuses a useful log filter target only when a slowest sample exists.
- [ ] Static tests pin the HTML/CSS/JS contracts for actionable diagnostics.
- [ ] Playwright covers desktop and mobile behavior, keyboard/focus basics, and no horizontal overflow.
- [ ] `git diff --check`, `npm run lint`, focused admin tests, Admin Console E2E, and `npm run verify` pass.

## Out of Scope

- New log query types, backend API changes, saved filters, or custom query language.
- Replacing the request log table or trace panel.
- Adding third-party component, icon, animation, or chart libraries.
