# Import File Status Accessible Feedback

## Goal

Frame `#importFileName` as a status region with tone-aware accessible labels for idle, reading, ready, and error states.

## Problem

Import file feedback is plain text with only `aria-live="polite"`. Reading/ready/error states are not framed for assistive tech, and failures stay polite instead of assertive.

## Requirements

- `role="status"` + `aria-atomic="true"` on `#importFileName`.
- `data-import-file-state` for idle/reading/ready/error.
- Dynamic `aria-label` with state prefix (等待文件 / 正在读取 / 已载入 / 读取失败).
- Error uses `aria-live="assertive"`; other states polite.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes update for all four states.
- [x] File pick success and error paths covered.
- [x] Verify + e2e green.
