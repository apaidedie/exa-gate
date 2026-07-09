# Polish table scroll affordances

## Goal

Make horizontally scrollable Admin Console tables feel more intentional and discoverable, especially on mobile and narrow desktop widths, by adding subtle scroll-edge affordances that fit the existing dark operations-console art direction.

## Background

Rendered UI inspection at 1440, 760, and 390 pixel widths showed no document-level horizontal overflow. The mobile request-log table correctly scrolls inside its table container, but dense columns such as status, key chain, token, and error can appear clipped without a clear visual cue that more columns are available horizontally. This task improves that affordance without changing table data, API behavior, or navigation.

## Requirements

- Add compact, token-driven visual hints to `.table-scroll` regions so operators can tell when horizontal content continues off-screen.
- Keep the effect subtle and operational: edge shadows or gradient fades are acceptable; decorative animation or large overlays are not.
- Avoid layout shifts in table headers, rows, pagers, trace panels, and key detail panels.
- Keep the implementation static and CSP-compatible: plain HTML/CSS/ES modules only, no new dependencies, no inline handlers.
- Respect `prefers-reduced-motion` and the existing dark technical visual system.
- Ensure the hints work for both key and request-log tables, including after tab switches and horizontal scrolling.

## Acceptance Criteria

- [ ] Key and log table scroll containers expose clear left/right overflow affordances when horizontal overflow exists.
- [ ] The affordance updates when the user scrolls horizontally so the leading/trailing hint disappears at the corresponding edge.
- [ ] Desktop, tablet, and mobile layouts keep document-level horizontal overflow at zero or one pixel.
- [ ] Static tests cover the CSS/JS contract for the scroll affordance.
- [ ] Playwright coverage verifies at least the mobile log-table affordance and edge-state updates.
- [ ] `npm run lint`, focused admin tests, admin-console E2E, and `npm run verify` pass.

## Out of Scope

- Redesigning table columns, replacing tables with cards, changing row data, or changing API responses.
- Adding a table virtualization library, component framework, or external icon/font assets.
- Changing README preview assets unless a later task explicitly targets screenshots.
