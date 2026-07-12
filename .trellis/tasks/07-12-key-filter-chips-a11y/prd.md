# Key Filter Chips Accessibility

## Goal

Make key-pool status filter chips announce selection state and purpose to assistive tech, matching sort-button and toggle patterns.

## Problem

`#keyFilterChips .chip` buttons only toggle a visual `.active` class. They lack `type="button"`, group labeling, `aria-pressed`, and descriptive `aria-label`s (counts are visual-only).

## Requirements

- `#keyFilterChips` is a labeled group (`role="group"` + `aria-label`).
- Each chip is `type="button"` with `aria-pressed` reflecting the active filter.
- Accessible name includes filter purpose and live count; count span is decorative (`aria-hidden`).
- `renderKeys()` keeps `aria-pressed` and labels in sync when filters/counts change.
- Unit pins; `npm run verify` green.

## Acceptance Criteria

- [x] Group + chip a11y attributes present.
- [x] Active chip has `aria-pressed="true"` after render sync.
- [x] Verify green.
