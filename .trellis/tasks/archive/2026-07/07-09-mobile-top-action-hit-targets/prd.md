# Fix mobile top action hit targets

## Goal

Make the Admin Console global action controls reliable on tablet and mobile widths by keeping the top action grid inside the header's actual layout box, so buttons such as refresh remain visible and clickable instead of being covered by the active panel header.

## Confirmed Facts

- The Admin Console is a static CSP-compatible vanilla HTML/CSS/ES module UI in `src/admin-ui/`.
- `src/admin-ui/index.html` renders many global controls inside `.top-actions`: secret display toggle, auto-refresh, interval select, last updated status, webhook test, refresh, and logout.
- `src/admin-ui/admin.css` switches `.console-shell` to three rows below `1279px`, and switches `.top-actions` to a CSS grid below `760px`.
- Rendered Playwright reproduction found no horizontal overflow, but at `760x844` and `390x844` the `.top-actions` box starts at `y=186` while `.topbar` ends at `y=185`; the visible refresh/logout controls occupy space below the header row and overlap the logs panel header.
- At those same widths, `document.elementFromPoint()` at the refresh button center returns `.panel-head`, and `page.click('#refresh')` times out because the button is intercepted by the panel header.
- Desktop `1440x960` and narrow desktop/tablet `1024x768` refresh clicks are currently reachable.

## Requirements

- Keep global top controls inside the topbar/header layout area at tablet and mobile widths.
- Preserve the existing desktop density and existing control set.
- Preserve DOM ids, form controls, labels, and event handlers.
- Avoid horizontal page overflow at desktop, tablet, and mobile widths.
- Keep buttons touch-friendly and visually aligned with the current dark operational SaaS style.
- Keep motion/accessibility behavior unchanged; this task should not introduce new animation.

## Acceptance Criteria

- [x] At `760x844` and `390x844`, the refresh button center is hit-testable as `#refresh` and Playwright can click it without interception.
- [x] At desktop `1440x960` and tablet `1024x768`, the topbar remains compact and refresh is still reachable.
- [x] The top actions do not visually overlap mobile tabs, panel headers, or main content.
- [x] No checked viewport has horizontal document overflow greater than 1px.
- [x] Existing Admin Console E2E flows still pass.
- [x] Static UI tests cover the responsive CSS invariant that mobile top actions participate in topbar layout.

## Out Of Scope

- Removing any global action.
- Adding a menu/dropdown system.
- Redesigning the full header, navigation, or toolbar.
- Changing refresh/session/webhook behavior or API contracts.
