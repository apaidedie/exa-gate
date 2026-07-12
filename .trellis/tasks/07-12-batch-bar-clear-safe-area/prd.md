# Batch Bar Clear and Safe Area

## Goal

Complete the fixed batch selection bar so operators can clear selection without unchecking rows one-by-one, and main content keeps a bottom safe-area while the bar is open so pager/rows are not covered on narrow screens.

## Requirements

- Add `#batchClearSelection` control on `#batchBar` that clears `state.selectedKeyIds`, re-renders keys (checkboxes), and hides the bar.
- Keep existing batch actions (enable / disable-with-confirm / reset / test).
- When the batch bar is visible, set a shell marker (e.g. `data-batch-open` on `[data-console-shell]` or `body`) so CSS can add bottom padding to `.main` / keys panel content.
- Safe-area padding should cover desktop (~54px bar) and stacked mobile bar (~72px+); avoid document-level horizontal overflow.
- Clear button has an accessible label (e.g. `清除已选密钥`).
- Unit pins + E2E: select → clear hides bar and unchecks rows; optional padding/marker assertion.
- CSP-compatible vanilla only; preserve existing DOM ids / `data-*` hooks.

## Acceptance Criteria

- [x] Batch bar includes clear/deselect control.
- [x] Clear empties selection, hides bar, updates workflow summary.
- [x] Open bar adds content bottom inset so last rows/pager remain reachable.
- [x] Desktop + 390px: no document horizontal overflow; controls usable.
- [x] `npm run verify` and e2e pass.

## Notes

- Lightweight PRD-only task.
- Do not redesign batch action labels beyond clear + safe-area.
