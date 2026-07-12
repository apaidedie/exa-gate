# Mobile sort-btn 44px

## Goal

On narrow viewports (≤760px), key table sortable header buttons (`.sort-btn`) must meet the 44px minimum touch target without changing desktop density or sort logic.

## Evidence / problem

- Base `.sort-btn { min-height: 28px }`
- Sort headers (请求/成功/失败/429/超时) are interactive but hard to tap next to 44px row actions and toolbar chrome
- ui-ux-pro-max: touch targets ≥44px (High)

## Requirements

1. At `max-width: 760px`, `.keys-panel .sort-btn` uses `min-height: 44px` (height 44px).
2. Preserve `data-sort`, aria-pressed, and sort indicator markup.
3. Desktop remains 28px.
4. Unit pins + e2e measure at least one sort header on 390/760.
5. Screenshots under `output/session-136-sort-btn/`.
6. If chrome budget fails, relax visible-row thresholds with evidence only.

## Acceptance Criteria

- [ ] ≤760px sort buttons ≥44px
- [ ] Desktop stays dense
- [ ] Sort behavior unchanged
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)

## Constraints / non-goals

- No enable-toggle redesign this unit
- No table column layout redesign beyond header hit area

## Notes

- Skill: ui-ux-pro-max
