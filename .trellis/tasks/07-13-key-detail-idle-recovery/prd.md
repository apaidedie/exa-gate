# Key detail idle recovery CTAs

## Goal

When keys exist but none is selected, key detail idle empty state offers recovery actions (select first key / focus search), not copy-only.

## Evidence

- `renderKeyIdleDetailEmpty()` is text-only
- first-run / filtered detail empties already have CTAs
- ui-ux-pro-max: empty states need message + action

## Requirements

1. Clearer idle copy with next step
2. Primary: 查看首个密钥 → select first page/list key
3. Secondary: 搜索密钥 → focus #keySearch
4. Wire via existing data-empty-action + runKeyEmptyAction
5. Sync index.html placeholders; unit pin; screenshots; verify 110 + e2e 7

## Acceptance

- [ ] idle detail has two recovery buttons
- [ ] handlers work without breaking first-run/filtered empties
- [ ] verify 110 + e2e 7
