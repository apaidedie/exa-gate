# Service Status Accessible Announcement

## Goal

Include live service health and summary metrics in overview summary-cell accessible names, and frame the trend window label as a status region.

## Problem

Overview summary buttons keep static aria-labels (e.g. “查看服务状态对应的密钥池”) while `#serviceStatus`, active keys, requests, and error rate change. Assistive tech does not hear the current health values when focusing these controls.

## Requirements

- Dynamically update aria-labels for the four summary-strip buttons with current values.
- Service button includes status text: 运行中 / 降级 / 无可用.
- `#trendWindowLabel` gets role=status + aria-label for the observation window.
- Preserve data-overview-signal-action hooks and button semantics.
- Unit + e2e pins; verify green.
- Do not change `#assetVersion` markup (server injects version via exact string match).

## Acceptance Criteria

- [x] Summary button labels include live values after updateSummary.
- [x] Trend window label is a status region.
- [x] Verify + e2e green.
