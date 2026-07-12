# Mobile key status filter chips 44px

## Goal

On narrow viewports (≤760px), keys-panel status filter chips (`#keyFilterChips .chip`) must meet the 44px minimum touch target — matching toolbar / topbar / batch / modal polish — without redoing filter-summary density work (session 123).

## Evidence / problem

- Base `.chip { min-height: 30px }`
- Mobile override keeps `.keys-panel #keyFilterChips .chip { min-height: 30px }`
- High-frequency status filters (全部/健康/冷却/禁用/异常) sit in the keys toolbar; 30px fails 44pt guidance (ui-ux-pro-max: touch target ≥44px, High)
- Session 123 densified *active filter summary* chips only; status chips were left dense intentionally then, but primary filter switching remains undersized next to 44px toolbar CTAs

## Requirements

1. At `max-width: 760px`, `#keyFilterChips .chip` uses `min-height: 44px` (and height 44px for alignment).
2. Keep horizontal scroll / nowrap behavior for chip overflow; preserve `data-chip` hooks and aria-pressed labels.
3. Align container `#keyFilterChips` min-height with chips so the row does not clip.
4. Do **not** enlarge filter-summary removable chips / empty muted chips (those stay dense per session 123).
5. Desktop density for `.chip` remains 30px.
6. Unit source pins + e2e height measure on at least All/Problem chips at 390/760.
7. If chrome budget fails (keyTableY / visible rows), adjust e2e thresholds with evidence only.

## Acceptance Criteria

- [ ] ≤760px status filter chips render ≥44px tall (screenshot + e2e)
- [ ] Filter summary chips / clear mini-btn density unchanged intentionally
- [ ] DOM hooks (`data-chip`, aria-pressed) unchanged
- [ ] `npm run verify` (110) and `npm run test:e2e` (7) pass
- [ ] Screenshots under `output/session-131-key-filter-chips/`
- [ ] Desktop chip height stays ~30px

## Constraints / non-goals

- No filter logic / copy changes
- No redesign of filter-summary removable chips
- CSP CSS only

## Notes

- Skill: ui-ux-pro-max (touch target 44px, spacing)
- Pattern ref: panel toolbar / batch bar 44px overrides
