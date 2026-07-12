# Latest Path Diagnostic Status A11y

## Goal

Frame `#latestStatus`, `#latestError`, `#latestPath`, and `#latestChain` as status regions with dynamic accessible labels for the ops link diagnostic card.

## Problem

These diagnostic values update as plain text. Assistive tech does not get framed names for latest upstream error status, path, or key chain.

## Requirements

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"` on all four.
- Dynamic aria-labels: `链路状态：…` / `最近错误：…` / `最后路径：…` / `密钥链路：…`.
- When latest status is bad/warn (not 无异常), use assertive on latestStatus only.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present and updated in updateOpsStrip.
- [x] Verify + e2e green.
