# Mobile key workflow items 44px

## Goal

On ≤760px, interactive `.key-workflow-item` tiles are ≥44px tall (currently 40px between 481–760; ≤480 already 44px).

## Evidence

- `@media (max-width: 760px) .key-workflow-item { min-height: 40px }`
- `@media (max-width: 480px) .key-workflow-item { min-height: 44px }`
- These are primary keys-panel filter shortcuts (reset/selected/problems/scope)
- ui-ux-pro-max: touch targets ≥44pt

## Requirements

1. Raise 760px rule to min-height 44px (keep compact padding/typography)
2. Desktop remains ~70px base density
3. Unit pin + e2e height on 390/760 keys panel
4. Screenshots output/session-146-key-workflow/

## Acceptance

- [ ] ≤760 key-workflow-item ≥44px
- [ ] Desktop unchanged (~70px)
- [ ] verify 110 + e2e 7
