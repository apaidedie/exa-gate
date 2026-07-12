# Trend empty recovery actions

## Goal

Overview trend empty state includes actionable recovery CTAs (adjust window / open logs), not copy-only.

## Evidence

- `trendEmptyMarkup()` is text-only
- Log/audit empty states now have CTAs (session 149+)
- ui-ux-pro-max: empty states need message + action

## Requirements

1. Clearer recovery copy for no samples in current window
2. Primary CTA: 调整观测窗口 → existing `trend-focus`
3. Secondary CTA: 查看请求日志 → existing `logs-focus`
4. Style empty-actions inside `.trend-empty` for desktop + mobile 44px
5. Unit pin + screenshots; verify 110 + e2e 7

## Acceptance

- [ ] trend empty has two recovery buttons with existing overview actions
- [ ] verify 110 + e2e 7
- [ ] shots output/session-150-trend-empty/
