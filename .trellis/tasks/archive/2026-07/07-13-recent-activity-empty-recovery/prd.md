# Recent activity empty recovery

## Goal

Overview recent-activity empty rail offers recovery CTAs (open logs / import keys when pool empty), not copy-only.

## Evidence

- `renderRecentActivityRail` empty branch is text-only
- Trend/log/key-detail empties now have CTAs (sessions 149–151)
- ui-ux-pro-max: empty states need message + action

## Requirements

1. Clearer empty copy by keys-ready vs no-keys
2. Primary: 查看请求日志 → logs-focus
3. Secondary: 导入密钥 when no keys, else 打开密钥池 → import-keys / keys
4. Style empty-actions in recent-activity-empty; mobile 44px
5. Unit pin + screenshots; verify 110 + e2e 7

## Acceptance

- [ ] empty rail has recovery buttons using existing overview actions
- [ ] verify 110 + e2e 7
- [ ] shots output/session-152-recent-activity-empty/
