# Toast Batch Bar Clearance

## Goal

When the fixed batch selection bar is open, toast feedback must sit above it so operators can still read success/error messages and reach batch actions (test / clear / disable).

## Problem evidence

- `#toast` is `position: fixed; bottom: 16px; z-index: 1100`
- `#batchBar` is `position: fixed; bottom: 0; z-index: 100` (taller on mobile ~72–132px)
- Content uses `--batch-bar-safe`; toast does not
- Batch actions call `showToast` while selection (and bar) remains open

## Requirements

- When batch bar is visible (`data-batch-open` / bar not hidden), toast bottom offset clears the measured bar height + gap.
- When batch bar is hidden, toast returns to default bottom-right (desktop) / full-width bottom (≤480).
- Prefer CSS variable lift (`--toast-lift`) updated from measured bar height (CSP-safe `setProperty`), with CSS fallback via shell marker.
- No document horizontal overflow at 390px.
- Unit pins + E2E geometry: toast rect does not intersect batch bar rect after batch toast.
- Preserve toast tones, motion tokens, `prefers-reduced-motion`.

## Acceptance Criteria

- [ ] Open batch bar + toast: toast fully above bar (gap ≥ 8px).
- [ ] Closed batch bar: toast default position unchanged.
- [ ] Mobile 390px stacked bar: same clearance.
- [ ] `npm run verify` + e2e green.
- [ ] Desktop + 390px screenshots evidence.

## Notes

- Lightweight PRD-only.
- Complements `07-12-batch-bar-clear-safe-area` (content padding only).
