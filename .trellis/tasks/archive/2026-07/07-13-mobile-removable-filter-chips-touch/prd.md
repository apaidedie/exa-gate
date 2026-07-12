# Mobile removable filter chips 44px

## Goal

On narrow viewports (≤760px), **active removable** filter chips (`button[data-filter-remove]`) must meet a 44px minimum touch height, while empty muted chips stay dense.

## Evidence / problem

- Active chips currently 26–34px on mobile via denser filter-strip rules
- Entire chip is the dismiss control (`data-filter-remove`); 32–34px fails 44pt guidance
- Session 132 raised clear-all mini-btn to 44px; individual chip remove remains undersized
- ui-ux-pro-max: touch targets ≥44px (High)

## Requirements

1. At `max-width: 760px` (and 390 overrides), `button.log-filter-chip.is-removable` / key / audit equivalents use `min-height: 44px` (and height 44px).
2. Empty muted chips (`.is-muted` / empty summary) stay dense (≤24px class).
3. Preserve `data-filter-remove` hooks and chip labels.
4. Update e2e thresholds from ≥32 to ≥44 for removable chips.
5. Unit CSS pins + screenshots under `output/session-140-removable-chips/`.

## Acceptance Criteria

- [ ] ≤760px removable chips ≥44px tall
- [ ] Empty muted chips remain dense
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)
- [ ] Desktop active chips stay dense (~26px)

## Constraints / non-goals

- Do not enlarge status filter chips again (session 131 already 44px)
- No filter logic changes

## Notes

- Skill: ui-ux-pro-max
