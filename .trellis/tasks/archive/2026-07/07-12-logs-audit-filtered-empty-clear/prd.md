# Logs Audit Filtered Empty Clear Actions

## Goal

Add in-body clear-filter recovery actions to Logs and Audit filtered empty states, matching the Key Pool filtered empty recovery pattern.

## Requirements

- R1: Filtered log empty state includes a primary clear-filters button that reuses `clearLogFilters()`.
- R2: Filtered audit empty state includes a primary clear-filters button that reuses `clearAuditFilters()`.
- R3: Non-filtered empty states remain non-actionable (no clear button).
- R4: Preserve existing summary-bar clear buttons and DOM ids.
- R5: Static + E2E coverage for both paths.

## Acceptance Criteria

- [x] Filtered logs empty shows clear action; click restores unfiltered logs.
- [x] Filtered audit empty shows clear action; click restores unfiltered audit list.
- [x] Empty (no data) states do not show clear-filters CTA.
- [x] Mobile/desktop no horizontal overflow for empty states.
- [x] Focused tests + `npm run verify` pass.

## Out Of Scope

- Refresh-failure panel recovery.
- Trace missing-state redesign.
