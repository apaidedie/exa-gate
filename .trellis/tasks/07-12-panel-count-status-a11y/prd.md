# Panel Count Status A11y

## Goal

Frame `#keyCount` and `#logCount` as status regions with dynamic accessible labels reflecting pool size and log window load/filter state.

## Problem

Panel head counts are plain text only. Assistive tech does not get a framed name for “how many keys/logs are in view,” especially when log counts switch between loaded vs filtered display.

## Requirements

- Both counts: `role="status"`, `aria-live="polite"`, `aria-atomic="true"`.
- `keyCount` aria-label like `密钥池：N 个密钥`.
- `logCount` aria-label distinguishes filtered vs loaded window copy.
- Update labels whenever text is rewritten.
- Unit + light e2e pins; verify green.

## Acceptance Criteria

- [x] keyCount/logCount status attributes present and updated.
- [x] Verify + e2e green.
