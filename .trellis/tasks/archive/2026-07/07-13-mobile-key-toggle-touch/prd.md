# Mobile key enable toggle 44px hit

## Goal

On narrow viewports (≤760px), key-row enable toggles (`button.toggle[data-action="toggle"]`) must provide a ≥44×44px touch target while remaining a clear on/off switch and preserving desktop density.

## Evidence / problem

- Base `.toggle { width: 36px; height: 20px }` — far below 44pt guidance
- E2E currently only requires toggle height ≥20 / width ≥34 on mobile
- Enable/disable is high-frequency and error-sensitive next to 44px row actions
- ui-ux-pro-max: touch targets ≥44px; small icons need expanded hit area

## Requirements

1. At `max-width: 760px`, keys-panel toggles use a ≥44px min height and ≥44px min width hit area.
2. Keep visual affordance of a switch (track + knob); may scale track for readability.
3. Preserve `data-action="toggle"`, aria-label, aria-pressed, `.on` class behavior.
4. Desktop remains 36×20.
5. Update e2e mobile thresholds for toggle; keep desktop thresholds.
6. Unit CSS pins + screenshots under `output/session-137-key-toggle/`.

## Acceptance Criteria

- [ ] ≤760px toggle bounding box ≥44 height and ≥44 width
- [ ] Desktop stays ~20×36
- [ ] Enable/disable still works in existing e2e flows
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)

## Constraints / non-goals

- No change to enable/disable API or confirm flows
- Prefer CSS-only; no markup change unless necessary for hit area

## Notes

- Skill: ui-ux-pro-max (touch target + hitSlop pattern)
