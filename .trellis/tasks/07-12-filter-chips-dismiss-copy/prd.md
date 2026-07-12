# Dismissible Filter Chips and Denser Summary Copy

## Goal

Make key/log/audit filter-summary chips dismissible one-by-one, and tighten filter summary copy for denser scanning.

## Problem

Filter chips are static spans; operators must use full "清除筛选" to remove one dimension. Empty-state summary copy is long for a secondary status strip.

## Requirements

- Active chips are buttons with `data-filter-remove` and remove affordance (×)
- Removing one chip clears only that dimension and re-renders (logs reload when server filters change)
- Empty-state chips remain non-interactive muted text
- Summary copy denser, keep meaning (match count / export scope)
- Preserve DOM ids (`#keyFilterSummary*`, `#logFilter*`, `#auditFilter*`, clear buttons)
- Unit + e2e pins; visual check desktop + 390 when active filters visible

## Acceptance Criteria

- [x] Dismissible chips for key/log/audit filter summaries
- [x] Denser empty/active summary copy
- [x] Verify + e2e green
