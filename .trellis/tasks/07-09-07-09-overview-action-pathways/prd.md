# Overview Action Pathways

## Goal

Make the Admin Console Overview turn its existing next-step insight into a direct operator action, so the first screen does more than describe the state: it routes the operator to the right workspace and focus target.

## Background

The Overview tab already summarizes service health, request trends, alert state, and a text-only "下一步" insight. That insight is valuable but passive. A polished operations console should let users act from the diagnosis without adding visual clutter or duplicating backend behavior.

Confirmed implementation facts:

- The frontend is a static vanilla HTML/CSS/ES module console in `src/admin-ui/`.
- `renderKeys.js` owns the key-derived Overview judgement and next-action copy.
- `renderObservability.js` owns the trend window insight.
- `admin.js` owns tab switching, modal opening, refresh, and command-style focus routing.
- Existing tests already cover Overview visibility, command palette routing, mobile navigation, import modal focus, and no horizontal overflow.

## Requirements

- Add a compact action control to the `insightNextAction` card without turning the Overview into a marketing or help page.
- The action must be derived from current console state and reuse existing UI behavior:
  - No keys: switch to Key Pool, focus the bulk import button, and open the import modal.
  - No healthy keys or degraded key pool: switch to Key Pool, select the problem filter, and focus the affected key controls.
  - Healthy pool but no traffic: switch to Request Logs and focus the log search/filter surface for request inspection.
  - Running with errors, 429 pressure, or cooldown: switch to Key Pool with the problem filter when key state is implicated; otherwise switch to Request Logs and focus diagnostics.
  - Stable operation: keep the operator in Overview and focus the time range selector for trend comparison.
- Keep copy short, operational, and consistent with existing Chinese UI text.
- Preserve CSP compatibility: no inline handlers, no dependencies, no external assets.
- Keep visual treatment aligned with the dark technical system: stable card dimensions, token-driven colors, visible focus, no layout-shifting hover states, and reduced-motion compatibility.
- Preserve desktop and mobile layout without document-level horizontal overflow at 390px.

## Acceptance Criteria

- [ ] Overview next-step card includes one visible, accessible action button.
- [ ] The action button label and accessible name update with the same state that drives the next-step insight.
- [ ] Clicking the action from an error/degraded seeded E2E state reaches the expected target tab and problem/log focus path.
- [ ] Clicking the action in the stable/no-action case focuses the time range selector without leaving Overview.
- [ ] Static tests pin the HTML/CSS/JS action-pathway contracts.
- [ ] Playwright covers desktop action routing and mobile visibility/no horizontal overflow.
- [ ] `git diff --check`, `npm run lint`, focused admin tests, Admin Console E2E, and `npm run verify` pass.

## Out of Scope

- New backend endpoints or persisted user preferences.
- Multi-step remediation wizards, saved recommendations, or global search changes.
- Replacing the command palette or existing tab navigation.
