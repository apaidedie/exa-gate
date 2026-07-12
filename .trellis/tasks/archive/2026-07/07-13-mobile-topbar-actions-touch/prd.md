# Mobile Topbar Action 44px Touch Targets

## Goal

Primary topbar action buttons (secret toggle, logout, command, webhook test, refresh) meet 44px touch height on narrow viewports.

## Problem

At ≤760/≤480, `.top-actions .ghost-btn` is min-height 32px — below the console’s 44px mobile touch standard already applied to tabs, empty CTAs, and recovery retry.

## Requirements

- ≤760px and ≤480px: primary topbar ghost buttons min-height ≥44px
- Keep status chips / interval select denser (may stay ~32–36px) to control chrome height
- Preserve topbarHeight < 150 and no horizontal overflow
- DOM hooks unchanged
- E2e height pins at 390 for primary actions
- Screenshots 760 + 390 of topbar

## Acceptance Criteria

- [x] CSS 44px for primary topbar actions
- [x] Verify + e2e green
- [x] Screenshots output/session-127-topbar-actions
