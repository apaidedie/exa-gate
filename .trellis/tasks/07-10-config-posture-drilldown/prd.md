# Config Posture Drilldown

## Goal
Make the Audit & Config configuration posture area feel like a mature operational console by turning static configuration evidence into semantic drill-down controls that focus the exact configuration detail they summarize.

## User Value
Operators should be able to scan HTTPS, raw key display, path policy, and state storage posture, then jump directly to the matching config detail without hunting through the panel. This improves first-run comprehension, auditability, and perceived polish while staying within the existing static Admin UI architecture.

## Confirmed Facts
- The Admin UI is a vanilla static HTML/CSS/ES module console served from `src/admin-ui/`.
- Current Audit & Config already has governance cards, audit evidence controls, a `configEvidence` summary, and config detail rows.
- Existing frontend conventions favor semantic controls, stable `data-*` hooks, visible focus states, no new dependencies, responsive hit-target tests, and CSP-friendly static assets.
- Recent slices made Overview, Key, Log, and Audit signals actionable; this slice extends the same interaction model to configuration posture.

## Requirements
- Convert the four `configEvidence` posture items into real `button type="button"` controls with stable `data-config-posture-action` hooks.
- Each posture control must navigate or keep the user on Audit & Config and focus the related detail row:
  - `https` -> login protection / HTTPS row.
  - `raw-key` -> key security row.
  - `paths` -> scheduling/path policy row.
  - `state` -> state storage row.
- Add focus/selection styling that highlights the target config row briefly without layout shift.
- Keep all copy concise, operational, and Chinese-first, consistent with the existing console.
- Keep CSS responsive: desktop and mobile controls must not overflow, clip text, or be covered by other UI.
- Do not add frontend dependencies, routers, icon libraries, fonts, or build steps.

## Acceptance Criteria
- Static/source tests confirm the config posture buttons, stable hooks, and target detail row IDs are present.
- E2E test confirms clicking each config posture control focuses the expected config row and preserves Audit & Config visibility.
- E2E target metrics confirm config posture controls meet minimum hit target size, avoid internal clipping, and avoid page overflow on desktop and mobile.
- `git diff --check`, targeted admin tests, e2e admin console tests, and `npm run verify` pass.

## Out of Scope
- Backend config mutation.
- New settings editing flows.
- New UI libraries or icon dependencies.
- Broad redesign of the Audit & Config page beyond the posture drill-down behavior.
