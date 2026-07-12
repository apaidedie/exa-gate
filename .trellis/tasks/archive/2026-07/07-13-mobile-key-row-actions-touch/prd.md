# Mobile key row action mini-btns 44px

## Goal

On narrow viewports (≤760px), key table row actions (详情 / 重置 / 测试) must meet the 44px minimum touch target — without enlarging desktop density or unrelated mini-btns (filter clear already 44px; readiness copy already 44px).

## Evidence / problem

- Base: `.mini-btn { height: 28px }` and `.action-cell .mini-btn { margin: 2px }`
- High-frequency per-row actions (select/detail, reset, test) remain 28px on mobile while chrome CTAs are already 44px
- ui-ux-pro-max: touch targets ≥44px (High/Critical); adjacent targets need spacing

## Requirements

1. At `max-width: 760px`, `.action-cell .mini-btn` uses `min-height/height: 44px`.
2. Keep `data-action` hooks (`select`, `reset`, `test`) and aria-labels.
3. Desktop remains 28px height.
4. Do not regress filter-clear / readiness mini-btn rules.
5. If visible key-row chrome budget fails, relax e2e thresholds with evidence only.
6. Unit pins + e2e measure on first key row actions at 390/760.
7. Screenshots under `output/session-133-key-row-actions/`.

## Acceptance Criteria

- [ ] ≤760px row action mini-btns ≥44px (screenshot + e2e)
- [ ] Desktop row actions stay ~28px
- [ ] DOM hooks unchanged
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)
- [ ] No horizontal page overflow (table may still scroll internally)

## Constraints / non-goals

- No pager mini-btn changes this unit (next candidate)
- No row action label/copy changes
- CSP CSS only

## Notes

- Skill: ui-ux-pro-max (touch target 44px, spacing)
