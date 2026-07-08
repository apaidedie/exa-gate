# Polish admin console motion

## Goal

Add restrained, operational-grade motion to the Admin Console so state changes feel polished without adding visual noise or hurting accessibility.

## User Value

- Operators get clearer cause-and-effect when switching tabs, opening import, and receiving toast feedback.
- The UI feels more refined for README/demo visitors while keeping the current dense console layout.
- The project moves closer to a star-worthy first impression without adding frontend dependencies.

## Confirmed Facts

- The Admin Console is static HTML/CSS/ES modules in `src/admin-ui/`.
- Existing CSS already uses token-driven colors and short transitions for controls and meters.
- A global `prefers-reduced-motion: reduce` block already disables animation and transitions.
- Modal and toast states are controlled by existing classes/inline display behavior.

## Requirements

- Add short, subtle motion for tab panel activation, import modal entrance, and toast feedback.
- Use only opacity, transform, color, border, or shadow transitions; no layout-shifting animation.
- Keep animation durations in a tight operational range around 120-220ms.
- Preserve all existing DOM ids, keyboard behavior, focus trapping, Escape close behavior, toast text, and toast timing.
- Keep `prefers-reduced-motion` effective for all added motion.
- Do not add GSAP, CSS frameworks, icon libraries, external fonts, or CDN assets.

## Acceptance Criteria

- [ ] Active tab panels have a subtle non-layout-shifting entrance.
- [ ] Import modal overlay/panel opens with a restrained fade/translate/scale treatment.
- [ ] Toast feedback appears with a concise entrance treatment while retaining semantic good/warn/bad styling.
- [ ] Reduced-motion users do not receive meaningful movement.
- [ ] Static tests pin the new motion contract.
- [ ] Playwright verifies the modal and toast still operate correctly after motion changes.
- [ ] Run `npm run lint`, focused admin tests, `npm run test:e2e`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check`.

## Out of Scope

- Redesigning layout, palette, typography, or data density.
- Adding scroll-linked animation, decorative loops, or animation dependencies.
- Reworking tab state management beyond what is needed to support CSS transitions safely.

## Notes

- Lightweight frontend polish task; PRD-only is sufficient.
