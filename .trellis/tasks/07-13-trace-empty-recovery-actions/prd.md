# Trace empty recovery CTAs

## Goal

Log trace panel idle/missing empty states offer recovery CTAs (refresh logs, focus search, clear filters), not steps-only copy.

## Evidence

- `renderTraceEmptyState` has chips + optional shortcuts but no empty-actions
- Log table empty already has refresh/clear CTAs
- ui-ux-pro-max: empty states need message + action

## Requirements

1. Idle: 刷新日志 + 聚焦搜索 (when no request selected)
2. Missing: 清除筛选 + 刷新日志 (when requestId has no rows)
3. Wire data-empty-action handlers on #tracePanel click path
4. Keep 选择请求 ID 查看链路 text for e2e
5. Style empty-actions; mobile idle keep CTAs usable
6. Unit pin + screenshots; verify 110 + e2e 7

## Acceptance

- [ ] idle/missing include recovery buttons
- [ ] handlers work
- [ ] verify 110 + e2e 7
