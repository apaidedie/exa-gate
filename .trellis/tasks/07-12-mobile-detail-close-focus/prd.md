# Return Focus After Closing Mobile Key Detail

## Goal

When an operator closes the mobile key detail panel, restore keyboard focus to a stable in-flow control—preferably the selected key row's 详情 button.

## Problem

`#closeMobileDetails` collapses the panel but leaves focus on a now-hidden control (or body), forcing keyboard users to re-tab through the table.

## Requirements

- On close: `mobileDetailsOpen = false`, remove `is-open`.
- Then focus, in order of preference:
  1. selected row `button[data-action="select"]`
  2. `#keySearch`
  3. first key filter chip
- Use `preventScroll: true` when focusing row control.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Close restores focus to row 详情 when a key is selected.
- [x] Panel still collapses.
- [x] Verify + e2e green.
