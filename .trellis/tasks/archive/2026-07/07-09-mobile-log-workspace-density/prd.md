# Improve mobile log workspace density

## Goal

Make the request-log tab useful on mobile by ensuring recent log rows are visible in the first screen, while preserving the existing filters, export, prune, trace diagnostics, and desktop layout density.

## UI Brief

- Audience: operators debugging proxy traffic and key failures, often under time pressure.
- Primary Workflow: open request logs, scan recent rows, filter by status/path/key, then inspect a request trace.
- Product Archetype: operational SaaS / data product.
- Constraints: static vanilla HTML/CSS/ES modules, CSP-compatible, no new framework or external assets, preserve existing DOM ids and event handlers.
- Source Of Truth: current Admin Console structure, frontend Trellis specs, rendered Playwright audit.
- States: unfiltered logs, filtered logs, empty filtered logs, trace empty state, trace selected state, mobile and desktop breakpoints.
- Acceptance: rendered desktop and mobile checks plus Playwright regression for visible mobile log rows.

## Confirmed Facts

- The Admin Console is a static CSP-compatible vanilla UI in `src/admin-ui/`.
- The logs tab toolbar currently contains `#logSearch`, `#logPathFilter`, `#logKeyFilter`, `#logStatusFilter`, `#applyLogFilters`, `#exportLogs`, and `#pruneLogs`.
- At `max-width: 480px`, `.toolbar, .log-tools, .modal-actions, .batch-actions { grid-template-columns: 1fr; }`, so every logs control becomes a full-width row.
- Rendered Playwright audit with demo data found:
  - `390x844` logs tab: `.toolbar` height `300px`, `.panel-head` height `373px`, `.log-table-scroll` height `1px`, visible log rows `0`.
  - `760x844` logs tab: `.toolbar` height `168px`, `.panel-head` height `241px`, `.log-table-scroll` height `1px`, visible log rows `0`.
  - Desktop `1440x960` logs tab: toolbar `32px`, table scroll `465px`, visible rows `12`.
- All controls are hit-testable; the problem is first-screen information density, not click interception.

## Requirements

- Keep all existing logs controls and DOM ids.
- On mobile/narrow tablet widths, reduce logs toolbar vertical footprint enough that recent log rows remain visible before selecting a trace.
- Preserve desktop and 1024px layout density.
- Keep controls touch-friendly, aligned, and readable; do not make buttons or inputs too small to use.
- Keep the trace panel available, but do not let the idle trace prompt consume space needed for the log table before a trace is selected.
- Preserve filtered empty states, filter summary, export/prune actions, and trace shortcut behavior.
- Avoid horizontal document overflow.

## Acceptance Criteria

- [x] At `390x844`, the logs tab renders at least 3 visible log rows with seeded demo/e2e data before any trace is selected.
- [x] At `760x844`, the logs tab renders at least 5 visible log rows with seeded demo/e2e data before any trace is selected.
- [x] At `390x844` and `760x844`, all logs controls remain visible, hit-testable, and readable.
- [x] The idle trace panel no longer consumes the first-screen diagnostic space needed for log rows on mobile, while selecting a trace still shows request-link details.
- [x] Desktop `1440x960` logs layout remains compact with no regression in visible rows or control reachability.
- [x] No checked viewport has horizontal document overflow greater than 1px.
- [x] Static UI tests cover the mobile logs density CSS/markup invariant.
- [x] Admin Console E2E covers the mobile logs first-screen visibility and trace expansion path.

## Out Of Scope

- Removing any filter or log action.
- Adding a dropdown/menu system.
- Changing logs API, filtering semantics, CSV export, or trace API.
- Redesigning the entire console shell or navigation.
