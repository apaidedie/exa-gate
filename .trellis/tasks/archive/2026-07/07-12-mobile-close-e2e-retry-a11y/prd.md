# Mobile Detail Close E2E + Retry A11y

## Goal

1. Pin mobile key-detail close control in Playwright so `#closeMobileDetails` actually collapses the panel.
2. Give `#retryRefresh` an explicit accessible name consistent with other recovery/topbar actions.

## Requirements

- `#retryRefresh` has `aria-label` describing retry of console refresh.
- Mobile e2e opens a key detail, clicks close, asserts panel collapsed, then can re-open.
- Unit pin for retry aria-label string.

## Acceptance Criteria

- [x] retryRefresh accessible name present.
- [x] e2e proves close collapses mobile details.
- [x] verify + e2e green.
