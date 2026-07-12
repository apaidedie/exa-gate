# Log empty state refresh action

## Goal

True-empty request log state (no filters) includes an actionable recovery CTA, matching audit empty-state pattern.

## Evidence

- Filtered empty: has "清除筛选" CTA
- True empty: copy only, no button — users must find toolbar refresh/apply manually
- ui-ux-pro-max: empty states need helpful message + action

## Requirements

1. True-empty log state adds primary "刷新日志" via `data-empty-action="refresh-logs"`
2. Wire handler to `reloadLogs` (same as apply filters refresh)
3. Keep filtered clear-filters path
4. Improve copy to state next step clearly
5. Unit pin + screenshots; verify 110 + e2e 7

## Acceptance

- [ ] True empty has refresh-logs button
- [ ] Handler reloads logs
- [ ] verify 110 + e2e 7
