# Key Detail Focus After Action

## Goal

After async key detail/row actions that re-render the detail panel (test/reset/enable/disable/copy), restore keyboard focus to the corresponding detail action button using the existing `detailFocusAction` intent window.

## Requirements

- Set `state.detailFocusAction` + `detailFocusUntil` before re-render/refresh for test, reset, enable, disable, copy.
- After enable, focus lands on `disable` (post-state toggle); after disable, focus lands on `enable`.
- Reuse `syncDetailFocusIntent` in `renderDetails` (already present).
- Unit pins for detailFocusAction assignments; verify green.

## Acceptance Criteria

- [x] Focus intent set for mutating detail actions.
- [ ] Verify green.
