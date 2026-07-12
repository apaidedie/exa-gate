# Trend Summary and Import Preview Status A11y

## Goal

Frame `#trendSummary` and `#importPreview` as status regions with dynamic accessible labels for trend health and import preflight state.

## Problem

1. `#trendSummary` badge text changes (等待数据/稳定/需关注) without role/status framing.
2. `#importPreview` has live/atomic attributes but no `role="status"` and no concise aria-label summarizing preflight recommendation.

## Requirements

- Both: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`.
- `trendSummary` aria-label like `趋势状态：稳定|需关注|等待数据`.
- `importPreview` aria-label summarizes recommendation title + key counts.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present and updated for both controls.
- [x] Verify + e2e green.
