# Mobile search and select 44px

## Goal

On ≤760px, panel `.search` / `.select` controls (keys/logs/audit toolbars, time range) are ≥44px tall, matching sibling toolbar buttons.

## Evidence

- Mobile rule: `.search, .search.compact, .select, .ghost-btn, .primary-btn, .danger-btn { min-height: 36px }`
- Buttons were raised to 44px with higher-specificity overrides; search/select remain 36px
- Primary filter workflow on mobile; ui-ux-pro-max touch ≥44px

## Requirements

1. Explicit mobile override for panel search/select + key IDs to min-height/height 44px
2. Desktop density unchanged
3. Unit pin + e2e height on 390 keys/logs
4. Screenshots output/session-145-search-select/

## Acceptance

- [ ] ≤760 #keySearch, #logSearch, #timeRange ≥44px
- [ ] Desktop remains denser (~32–36px)
- [ ] verify 110 + e2e 7
