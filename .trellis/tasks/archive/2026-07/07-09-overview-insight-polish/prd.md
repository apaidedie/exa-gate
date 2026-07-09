# Polish overview insight states

## Goal

Make the Admin Console overview more immediately useful and visually polished by adding a compact operational insight band. The first viewport should tell an operator what the system state is, what to check next, and which observation window the data reflects without requiring them to interpret every metric card manually.

## UI Brief

- Audience: self-hosted operators and developers running an Exa reverse proxy under operational pressure.
- Primary workflow: open the console, assess service health, identify the next action, then drill into keys/logs/alerts.
- Product archetype: operational SaaS / data product.
- Art direction: dense but calm dark technical console; restrained green/blue status language; amber/red for actionable risk; no new framework, CDN font, or decorative assets.
- Source of truth: existing `src/admin-ui/` static UI, frontend Trellis specs, and `ui-ux-pro-max` guidance for real-time operations dashboards.
- States: healthy, warning, bad, no data, mobile stacked layout, reduced-motion-compatible static rendering.
- Acceptance: static tests, Playwright E2E coverage, `npm run verify`, and rendered desktop/mobile QA with no horizontal overflow.

## Confirmed Facts

- The overview tab already renders summary cells, metric cards, an ops strip, trend bars, and alerts from `state.keys`, `state.logs`, and `state.observability`.
- `updateSummary()` in `src/admin-ui/renderKeys.js` owns key/log-derived overview values.
- `renderObservability()` in `src/admin-ui/renderObservability.js` owns trend, alert, and retention data.
- The frontend must stay vanilla HTML/CSS/ES modules and CSP-compatible.
- Existing specs require token-driven styling, stable flex panel sizing, visible focus, no horizontal overflow, and rendered QA for pixel/layout changes.

## Requirements

- Add a compact overview insight band near the top of the overview tab with three synthesized states: current judgment, next action, and observation window.
- Derive insight copy and tone from existing client state only; do not add a backend endpoint or new dependency.
- Keep the copy operational and specific: healthy state should signal no action needed, warning/bad states should tell operators what area to inspect.
- Preserve existing overview metrics, trend bars, alerts, ids, and tab behavior.
- Keep the band responsive: desktop should scan as a row; mobile should stack without overlap, clipping, or document-level horizontal overflow.
- Use semantic status color plus text, not color alone.

## Acceptance Criteria

- [x] Overview includes visible current judgment, next action, and observation window states after login.
- [x] Healthy, warning, and no-data/bad branches are represented in rendering logic with stable DOM ids/classes.
- [x] Playwright covers the overview insight band on desktop and mobile navigation paths.
- [x] Static bundle tests pin the new structure, copy, and render helpers.
- [x] `npm run test:e2e`, `npm test`, `npm run build`, and `npm run verify` pass.
- [x] Rendered desktop and mobile QA confirms the insight band has no horizontal overflow or overlapping text.

## Notes

- This is a lightweight PRD-only frontend task. No backend contract change is planned.
