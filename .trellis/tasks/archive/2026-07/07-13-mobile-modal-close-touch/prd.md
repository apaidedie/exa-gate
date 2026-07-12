# Mobile modal close 44px

## Goal

On narrow viewports (≤760px), modal dismiss controls (`.modal-close`) and the mobile key-details close button (`#closeMobileDetails`) must meet the 44px minimum touch target — without changing desktop density or modal foot CTAs already polished in session 130.

## Evidence / problem

- Base `.modal-close { min-width/min-height: 36px }`
- Command palette close uses the same class (`.command-palette-head .modal-close { min-height: 38px }` on desktop rules)
- `#closeMobileDetails` is a ghost-btn under the generic mobile 36px control rule
- Dismiss controls are high-frequency on import/confirm/command palette and mobile details; 36px fails 44pt guidance (ui-ux-pro-max)

## Requirements

1. At `max-width: 760px`, `.modal-close` uses `min-width/min-height/width/height: 44px`.
2. At the same breakpoint, `#closeMobileDetails` uses `min-height/height: 44px` (beats generic 36px).
3. Preserve DOM ids: `#closeImportModal`, `#closeConfirmAction`, `#closeCommandPalette`, `#closeMobileDetails`.
4. Desktop close remains ~36–38px.
5. Unit pins + e2e measure when a modal is open (confirm path already opens on narrow test).
6. Screenshots under `output/session-135-modal-close/`.

## Acceptance Criteria

- [ ] ≤760px modal-close ≥44px (screenshot + e2e)
- [ ] ≤760px `#closeMobileDetails` ≥44px when panel open (screenshot or e2e)
- [ ] Desktop close stays dense
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)

## Constraints / non-goals

- No modal open/close logic changes
- No redesign of command palette option rows
- CSP CSS only

## Notes

- Skill: ui-ux-pro-max (touch target 44px)
