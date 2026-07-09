# Design

## Boundary

This task is limited to the static Admin Console overview tab. The implementation may touch:

- `src/admin-ui/index.html` for structural placeholders and copy.
- `src/admin-ui/renderObservability.js` for trend and alert rendering.
- `src/admin-ui/admin.css` for visual hierarchy, responsive behavior, and state styling.
- Tests and a task-local rendered QA script.

No backend API, build pipeline, or dependency changes are planned.

## UI Brief

- Audience: self-hosted operators managing a reverse proxy key pool and reading operational health under mild urgency.
- Primary workflow: understand whether the proxy is stable, whether traffic or failures changed in the selected window, and whether any alert needs action.
- Product archetype: operational SaaS / data product.
- Constraints: vanilla HTML/CSS/ES modules, CSP-safe, dark technical art direction, stable DOM ids, Chinese operator copy, desktop and mobile support.
- Source of truth: current Admin Console tokens and layout, Trellis frontend specs, `ui-design-suite` routing, and `ui-ux-pro-max` operational dashboard recommendations.
- States: default, empty trend data, active alerts, no-alerts, hover/focus inherited controls, mobile single-column layout.
- Acceptance: automated tests plus desktop/mobile rendered QA with overflow checks.

## Rendering Contract

- `renderObservability()` continues to own trend bars, alert list, alert count, trend label, trend status badge, and retention summary.
- Trend summary values are derived from the existing `trends` buckets: request sum, failure sum, 429 sum, and peak request bucket.
- Empty trend state renders structured content rather than a bare sentence.
- Alert cards render only escaped title and message values. Severity labels are derived locally from `alert.severity`.
- Existing ids are preserved; new ids may be added only inside the overview tab for testability.

## Visual Design

- Add a compact trend recap strip above the chart so the chart has text-backed interpretation.
- Treat the chart as a framed tool surface, not a decorative card.
- Make alert items denser and clearer with severity badges, message copy, and a muted operator action line.
- Use existing semantic tones: green for stable, amber for attention, red for severe, blue for contextual window state.
- Keep panel radii at existing `--radius-sm` / `--radius` values.

## Compatibility

- Existing E2E copy checks that look for trend bucket/sample context must continue to pass.
- CSS remains token-driven. Dynamic chart heights continue using CSP-safe CSS custom properties set from JS.
- Mobile layout remains one column below the existing breakpoints, and no new fixed elements are introduced.

## Rollback

The rollback point is the overview slice: revert changes in `index.html`, `renderObservability.js`, `admin.css`, tests, and the task-local rendered QA script. No data migration or server rollback is required.
