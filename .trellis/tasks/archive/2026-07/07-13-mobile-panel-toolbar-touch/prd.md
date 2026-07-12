# Mobile Panel Toolbar 44px Actions

## Goal

Keys, logs, and audit panel toolbar primary buttons meet 44px touch height on narrow viewports.

## Problem

At ≤760, panel toolbar ghost/primary/danger buttons inherit the generic `min-height: 36px` rule, below the console’s 44px mobile standard now used for tabs, topbar actions, empty CTAs, and recovery.

## Requirements

- ≤760/≤480: keys toolbar action buttons, log-tools action buttons, audit-tools action buttons ≥44px
- Search/select inputs may stay 36px to control vertical density
- Preserve grid layouts and DOM ids
- E2e height pins at 390 for key/log toolbar actions
- Screenshots 390 keys + logs toolbars

## Acceptance Criteria

- [x] CSS 44px panel toolbar actions
- [x] Verify + e2e green
- [x] Screenshots output/session-128-panel-toolbar
