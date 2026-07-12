# Mobile batch bar 44px actions

## Goal

On narrow viewports (≤760px), batch selection bar action buttons must meet the 44px minimum touch target, matching topbar / mobile-tabs / panel-toolbar / detail-actions polish — without breaking desktop density or DOM hooks.

## Evidence / problem

- Base rule: `.batch-actions .ghost-btn, .batch-actions .primary-btn { min-height: 36px; }`
- At ≤760px, generic control rule forces `.ghost-btn, .primary-btn { min-height: 36px }` again
- Batch bar already stacks into a 2-column grid on mobile, but action hit areas stay 36px
- Fixed bottom bar is high-frequency (enable/disable/reset/test/clear); 36px fails WCAG/iOS 44pt guidance (ui-ux-pro-max: touch target ≥44px, Critical/High)

## Requirements

1. At `max-width: 760px`, `#batchBar .batch-actions` buttons (`ghost-btn` / `primary-btn`) use `min-height: 44px` (and fixed height if needed for alignment).
2. Specificity must beat the generic mobile `min-height: 36px` control rule (same pattern as panel toolbar comment).
3. Preserve DOM ids: `#batchBar`, `#batchClearSelection`, `#batchEnableSelected`, `#batchDisableSelected`, `#batchResetSelected`, `#batchTestSelected`.
4. Keep desktop (≥761px) batch actions at 36px density unless already intentional.
5. If taller buttons require more bottom inset, adjust `--batch-bar-safe` only with evidence (chrome budget / content not clipped).
6. CSP-compatible CSS only; no layout thrash animations.
7. Unit source pins + existing e2e batch flows still green; add/adjust pin if chrome height changes.

## Acceptance Criteria

- [ ] ≤760px batch action buttons render ≥44px tall (screenshot + optional e2e measure)
- [ ] Generic 36px mobile control rule does not override batch actions
- [ ] DOM hooks and batch selection behavior unchanged
- [ ] `npm run verify` (unit 110) and `npm run test:e2e` (7) pass
- [ ] Before/after + final 390px screenshots under `output/session-129-batch-bar/`
- [ ] Desktop batch bar density not unintentionally enlarged

## Constraints / non-goals

- Do not redesign batch bar copy, order, or enablement logic
- Do not remove batch features
- Do not change sidebar/desktop fixed positioning model beyond safe-area inset if required
- Prefer transform/opacity for any motion (none expected here)

## Notes

- Skill: ui-ux-pro-max (touch target 44px, spacing ≥8px, safe bottom chrome)
- Pattern ref: panel toolbar 44px override after generic 36px rule
