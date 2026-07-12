# Mobile Empty-State Touch Targets

## Goal

On narrow viewports, empty/first-run/filtered empty CTAs meet 44px touch height and remain scannable with slightly denser padding.

## Problem

Empty-state primary/ghost actions use min-height 36px. On mobile this is below the 44px touch guidance used elsewhere in the console.

## Requirements

- ≤760px: empty-actions buttons (key/log/audit/first-run/detail) min-height ≥44px
- Prefer full-width primary CTA on very narrow rows when a single action is present
- Compact empty-state padding without losing hierarchy
- Preserve data-empty-action hooks and existing copy
- E2e pins on 390 for filtered/first-run empty CTA height
- Screenshots desktop + 390 of empty/filtered states

## Acceptance Criteria

- [x] CSS rules for mobile empty CTAs
- [x] Verify + e2e green
- [x] Screenshots captured (output/session-124-empty-touch)
