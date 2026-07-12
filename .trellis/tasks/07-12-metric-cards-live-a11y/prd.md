# Metric Cards Live Accessible Labels

## Goal

Include live metric values in overview metric-card accessible names, matching the summary-strip pattern.

## Problem

Metric cards keep static aria-labels (e.g. "查看近 24 小时请求日志") while `#usageMetric`, success rate, 429 count, latency, and failures update. Assistive tech does not hear the current numbers when focusing these controls.

## Requirements

- Add `data-metric-card` hooks for usage/success/rate-limit/latency/failure.
- Dynamically set aria-labels with current values + action hint after `updateSummary()`.
- Preserve `data-overview-signal-action` hooks and button semantics.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Metric card labels include live values after updateSummary.
- [x] Verify + e2e green.
