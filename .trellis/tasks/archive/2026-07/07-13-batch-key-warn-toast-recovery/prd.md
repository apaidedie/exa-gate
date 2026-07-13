# Batch and key warn toast recovery

## Goal

Remaining warn toasts for batch/key/import edge cases include recovery next steps (select keys, import, clear filters, wait for samples).

## Evidence

- Several warn toasts still short: 没有可批量处理的密钥, 密钥不在池, 原始密钥显示已关闭, 文件类型, 未解析到有效密钥
- ui-ux-pro-max: errors/warnings need recovery paths

## Requirements

1. Polish listed warn toasts with next steps
2. Keep already-good sample/audit waits
3. Unit pins for new strings
4. Screenshots of a representative warn toast if feasible
5. verify 110 + e2e 7

## Acceptance

- [ ] warn toasts include recovery guidance
- [ ] verify 110 + e2e 7
