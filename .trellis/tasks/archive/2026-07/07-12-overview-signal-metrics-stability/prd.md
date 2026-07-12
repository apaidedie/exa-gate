# Overview Signal Metrics Stability

## Goal

Harden the flaky E2E helper that measures overview signal buttons (DOM detach during re-render), and improve refresh-failure recovery banner accessibility so status and retry are properly linked for assistive tech.

## Requirements

- `overviewSignalTargetMetrics` must tolerate overview re-renders mid-measurement (detached nodes) without failing the suite.
- Prefer fresh element handles + `isConnected` checks; skip unmeasurable buttons instead of throwing.
- When refresh recovery is visible, link `#lastUpdated` to recovery copy via `aria-describedby="refreshRecoveryText"`.
- When recovery is visible, give retry a clearer `aria-label` (`立即重试控制台刷新`); restore a short default when hidden.
- Keep product DOM ids / `data-*` hooks stable; CSP-compatible vanilla admin UI only.
- Pin recovery a11y strings in unit tests; keep full `npm run verify` green.

## Acceptance Criteria

- [x] `overviewSignalTargetMetrics` uses element handles, `isConnected` guards, and try/catch skip on detach.
- [x] `setRefreshRecovery` sets/clears `aria-describedby` on `#lastUpdated` and updates retry `aria-label`.
- [x] Unit pins cover `aria-describedby` + `立即重试控制台刷新`.
- [x] `npm run verify` passes.

## Notes

- Lightweight PRD-only task.
- No product layout redesign; test stability + a11y wiring only.
