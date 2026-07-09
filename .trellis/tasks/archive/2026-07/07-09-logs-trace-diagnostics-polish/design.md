# Design

## Boundary

This task is limited to the Admin Console request logs tab. The implementation may touch:

- `src/admin-ui/index.html` for log diagnostics placeholders.
- `src/admin-ui/renderLogs.js` for visible-row diagnostics and trace summary rendering.
- `src/admin-ui/admin.css` for layout, responsive behavior, and trace state styling.
- Existing Admin UI tests and a task-local rendered QA script.

No backend route, API helper, state persistence, or dependency changes are planned.

## UI Brief

- Audience: self-hosted operators investigating proxy failures, slow requests, 429 pressure, or key-chain behavior.
- Primary workflow: filter logs, read posture, click a request id, and understand the trace outcome quickly.
- Product archetype: operational SaaS / data product.
- Constraints: vanilla HTML/CSS/ES modules, CSP-safe, dark technical design system, Chinese operator copy, stable ids, desktop and mobile support.
- Source of truth: current Admin Console components, frontend specs, UI design skill routing, and existing tests.
- States: default logs, filtered logs, empty rows, idle trace, active trace, missing trace, desktop table, mobile scroller.
- Acceptance: automated tests plus desktop/mobile rendered QA with overflow and visibility checks.

## Rendering Contract

- `renderLogs()` continues to own table rows and filter summary.
- A new `logDiagnostics` region is derived from the same visible rows as the table, so keyword filtering and remote filters share one source of truth.
- `renderLogTrace()` continues to own `tracePanel`; active traces render a summary before `.trace-list` while preserving `.trace-item` rows.
- Existing `data-trace-id` buttons remain the trace loading contract.
- All log fields, request ids, paths, queries, status values, and key chain text must be escaped before HTML insertion.

## Visual Design

- Use a compact four-cell diagnostic strip: visible logs, errors, 429, slowest request.
- Use semantic color only for status posture; keep the surface neutral and dense.
- Active trace should look like a diagnostic report: summary facts first, attempt timeline second.
- Mobile keeps the table horizontally scrollable and moves diagnostics into a two-column compact grid.

## Compatibility

- Existing trace assertions that look for `请求链路`, `.trace-item`, and status text must remain valid.
- Existing filtered log assertions remain valid.
- CSS uses existing radius, line, status, and motion tokens.

## Rollback

Revert changes in `index.html`, `renderLogs.js`, `admin.css`, tests, and the task-local QA script. No server state or migration rollback is required.
