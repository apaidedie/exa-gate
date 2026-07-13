# Command palette empty recovery

## Goal

When command search has no matches, empty state offers actionable recovery (clear search / try suggested keywords), not copy-only.

## Evidence

- `#commandEmpty` is text-only with keyword tips
- Other empties now have CTAs (sessions 149–155)
- ui-ux-pro-max: empty states need message + action

## Requirements

1. Primary: 清空搜索 → clear #commandSearch and re-render
2. Secondary: 试搜「密钥」 → set query to 密钥 and re-render
3. Optional tertiary chip-style not required if two buttons enough
4. Mobile empty CTAs ≥44px
5. Unit pin + e2e still sees 没有匹配的操作; screenshots; verify 110 + e2e 7

## Acceptance

- [ ] empty has recovery buttons
- [ ] clear restores full list
- [ ] verify 110 + e2e 7
