# Alert empty recovery CTAs

## Goal

Healthy alert-center empty state still offers monitoring shortcuts (keys / logs), not copy-only reassurance.

## Evidence

- `alertEmptyMarkup()` is text-only
- Trend/recent-activity empties now have CTAs
- ui-ux-pro-max: empty states benefit from next-step actions even when "all good"

## Requirements

1. Clearer healthy copy + optional monitoring next steps
2. Primary: 查看密钥池 → keys
3. Secondary: 查看请求日志 → logs-focus
4. Style empty-actions like trend-empty; mobile 44px
5. Sync index.html placeholder; unit pin; screenshots; verify 110 + e2e 7

## Acceptance

- [ ] alert empty has two recovery buttons
- [ ] e2e still accepts 无需人工处理 text
- [ ] verify 110 + e2e 7
