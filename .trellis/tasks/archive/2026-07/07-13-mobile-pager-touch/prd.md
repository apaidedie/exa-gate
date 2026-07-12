# Mobile pager mini-btns 44px

## Goal

On narrow viewports (≤760px), keys-panel pager prev/next mini-btns (`#prevKeyPage`, `#nextKeyPage`) must meet the 44px minimum touch target. Optionally align page-size select and jump input height for consistent pager chrome — without changing desktop density.

## Evidence / problem

- Only the keys panel has interactive pager mini-btns (logs/audit are status/hint only)
- Base `.mini-btn { height: 28px }` applies to `#prevKeyPage` / `#nextKeyPage`
- Mobile pager stacks vertically but buttons stay 28px; ui-ux-pro-max requires ≥44px touch targets

## Requirements

1. At `max-width: 760px`, `.pager-actions .mini-btn` (and/or `#prevKeyPage`/`#nextKeyPage`) use `min-height/height: 44px`.
2. Raise `.pager-actions .page-size-select` and `.jump-input` to at least 36–44px for touch consistency (prefer 44px for primary controls).
3. Preserve DOM ids and disabled state behavior.
4. Desktop density unchanged (~28–32px).
5. Unit pins + e2e measure at 390/760.
6. Screenshots under `output/session-134-pager/`.

## Acceptance Criteria

- [ ] ≤760px prev/next ≥44px (screenshot + e2e)
- [ ] Desktop prev/next stay dense
- [ ] DOM hooks unchanged
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)

## Constraints / non-goals

- No pagination logic changes
- No inventing log/audit prev-next buttons

## Notes

- Skill: ui-ux-pro-max (touch target 44px)
