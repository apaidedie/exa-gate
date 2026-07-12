# Refresh Recovery Mobile Touch Targets

## Goal

On narrow viewports, the console refresh-failure recovery strip uses a 44px retry CTA and denser, scannable copy layout.

## Problem

`#retryRefresh` is 40px on mobile (and 36px desktop). Error recovery is a high-stakes action and should match the 44px touch standard used for empty-state CTAs and mobile diagnostics.

## Requirements

- ≤760px: `.refresh-recovery-retry` min-height 44px, full width
- Slightly denser recovery padding/gap; keep kicker + title + detail readable
- Preserve DOM ids (`#refreshRecovery`, `#retryRefresh`) and recovery copy semantics
- E2e pin height ≥44 when recovery is visible at 390
- Screenshots of recovery strip desktop + 390 when feasible

## Acceptance Criteria

- [x] CSS mobile 44px retry (beats .primary-btn 36px)
- [x] Verify + e2e green
- [x] Screenshots output/session-125-refresh-recovery
