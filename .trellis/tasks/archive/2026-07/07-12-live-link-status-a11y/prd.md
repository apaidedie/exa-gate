# Live Link Status Accessible Name

## Goal

Make the SSE live-link chip announce a clear status name, not only the short visible label.

## Problem

`#liveLinkStatus` uses short copy (`实时在线/重连/离线`) with `aria-live`, but no `role="status"` or contextual `aria-label`, so assistive tech may not frame it as the console live-link state.

## Requirements

- `role="status"` on `#liveLinkStatus`.
- `aria-label` updates with each state: 已连接 / 正在重连 / 已断开.
- Keep short visible text for topbar density.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status role + dynamic aria-label present.
- [x] Live state still updates visible text.
- [x] Verify + e2e green.
