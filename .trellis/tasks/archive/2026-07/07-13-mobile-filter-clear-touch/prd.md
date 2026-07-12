# Mobile filter clear mini-btn 44px

## Goal

On narrow viewports (≤760px), filter-summary clear actions (`#clearKeyFilters`, `#clearLogFilters`, `#clearAuditFilters`) must meet the 44px minimum touch target — without enlarging dense removable filter chips (session 123) or desktop mini-btn density.

## Evidence / problem

- Base `.mini-btn { height: 28px }`
- Mobile filter-summary clear buttons sit at 28–34px via competing rules:
  - `.key-filter-summary:not(.is-empty) .mini-btn { min-height: 28px }`
  - `.log-filter-summary .mini-btn … { min-height: 34px }`
  - smaller breakpoints keep 32–34px
- Clear-filter is a high-frequency recovery action after filtering; 28–34px fails 44pt guidance (ui-ux-pro-max: touch target ≥44px)

## Requirements

1. At `max-width: 760px` (and narrower overrides), clear-filter mini-btns use `min-height: 44px` / `height: 44px`.
2. Specificity must beat denser filter-summary mini-btn rules.
3. Preserve DOM ids and `data-*-filter-action="clear"` hooks.
4. Do **not** enlarge removable filter chips or empty muted chips.
5. Desktop mini-btn density unchanged (~28px).
6. Unit pins + e2e measure when clear buttons are visible (apply a filter first).
7. Screenshots under `output/session-132-filter-clear/`.

## Acceptance Criteria

- [ ] ≤760px clear-filter buttons ≥44px when visible
- [ ] Filter chips / status chips density policy unchanged except prior 44px status chips
- [ ] DOM hooks unchanged
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)
- [ ] Desktop clear button stays dense when shown

## Constraints / non-goals

- No filter logic/copy changes
- No row action mini-btn / pager changes this unit
- CSP CSS only

## Notes

- Skill: ui-ux-pro-max (touch target 44px)
