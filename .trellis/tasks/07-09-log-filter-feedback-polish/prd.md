# Polish log filter feedback

## Goal

Make the Admin Console request-log filters easier to understand and undo. Operators should be able to see which log constraints are active, clear them without editing each field, and trust the result count before exporting or opening a trace.

## Confirmed Facts

- The Admin Console is a CSP-compatible vanilla HTML/CSS/ES module UI under `src/admin-ui/`.
- Log filtering currently uses `#logSearch`, `#logPathFilter`, `#logKeyFilter`, `#logStatusFilter`, `#applyLogFilters`, and `fetchLogs()` / `renderLogs()`.
- Server-side path/key/status filters are read from the current DOM controls in `src/admin-ui/api.js`; the in-table text search is applied in `renderLogs()`.
- Recent log trace work added structured log and trace empty states plus mobile trace shortcuts.
- Frontend specs require token-driven CSS, stable responsive layouts, real controls, preserved DOM hooks, Playwright coverage for visible workflow changes, and rendered mobile/desktop QA for layout changes.

## Requirements

- Add a compact active-filter summary inside the request-log panel that reflects text search, path, key, and status constraints.
- Provide a clear-all action that resets the log search and server-side filter controls, refreshes logs from the unfiltered endpoint, re-renders rows, and updates the trace panel without requiring page reload.
- Keep existing filter controls, ids, API query behavior, export behavior, and trace button behavior compatible.
- Improve visible copy around counts and filtered states so operators can distinguish loaded server rows from currently visible rows.
- Keep the implementation static and CSP-compatible: no framework, external asset, inline script, or new dependency.
- Maintain mobile usability with wrapping filter chips and no document-level horizontal overflow.

## Acceptance Criteria

- [x] Active log filters render as visible chips/summary text after search/path/key/status changes.
- [x] Clear-all resets `#logSearch`, `#logPathFilter`, `#logKeyFilter`, and `#logStatusFilter`, fetches unfiltered logs, and removes the active-filter summary.
- [x] Filtered-empty and unfiltered-empty log states still render correctly.
- [x] Desktop and mobile Playwright paths cover applying a log filter and clearing active filters.
- [x] `npm run test:e2e`, `npm test`, `npm run build`, and `npm run verify` pass.
- [x] Rendered QA confirms no horizontal page overflow and usable filter summary on desktop and mobile.

## Notes

- This is a lightweight PRD-only task. No backend contract change is planned.
