# Mobile modal foot 44px actions

## Goal

On narrow viewports (≤760px), modal and confirm dialog foot action buttons must meet the 44px minimum touch target — matching batch bar / toolbar / topbar polish — without changing desktop density or DOM hooks.

## Evidence / problem

- Base: `.modal-actions .ghost-btn, .modal-actions .primary-btn { min-height: 38px }` and `.modal-actions .danger-btn { min-height: 38px }`
- At ≤760px, generic control rule forces `.ghost-btn, .primary-btn, .danger-btn { min-height: 36px }`
- Confirm dialogs (`#confirmActionCancel` / `#confirmActionAccept`) and import modal foot CTAs are high-stakes; 36–38px fails 44pt guidance (ui-ux-pro-max: touch target ≥44px)

## Requirements

1. At `max-width: 760px`, `.modal-actions` buttons (ghost / primary / danger) use `min-height: 44px` (height 44px for alignment).
2. Specificity must beat the generic mobile 36px control rule (comment pin pattern).
3. Preserve DOM ids: `#confirmActionCancel`, `#confirmActionAccept`, import modal foot buttons, etc.
4. Keep desktop (≥761px) at existing 38px density.
5. CSP-compatible CSS only; no behavior changes.
6. Unit source pins + e2e measure on confirm buttons at 390/760.

## Acceptance Criteria

- [ ] ≤760px modal foot buttons render ≥44px tall (screenshot + e2e)
- [ ] Generic 36px rule does not override modal actions
- [ ] Confirm cancel/accept and import modal foot unchanged in labels/hooks
- [ ] `npm run verify` (110) and `npm run test:e2e` (7) pass
- [ ] Screenshots under `output/session-130-modal-foot/`
- [ ] Desktop modal density not unintentionally enlarged

## Constraints / non-goals

- Do not redesign modal copy, order, or confirm logic
- Do not change command palette option sizing beyond existing mobile rules
- Prefer no motion changes

## Notes

- Skill: ui-ux-pro-max (touch target 44px)
- Pattern ref: batch bar / panel toolbar 44px override after generic 36px rule
