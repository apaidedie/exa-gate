# Design

## Boundary

This task is limited to the Admin Console `审计与配置` tab. Planned files:

- `src/admin-ui/index.html` for audit/config summary placeholders.
- `src/admin-ui/renderLogs.js` for audit evidence derivation and row markup refinement.
- `src/admin-ui/renderObservability.js` for config evidence derivation.
- `src/admin-ui/admin.css` for layout, responsive polish, and evidence surfaces.
- Existing Admin UI tests plus a task-local rendered QA script.

No backend routes, state schema, API payloads, dependencies, or build pipeline changes are planned.

## UI Brief

- Audience: self-hosted operators validating admin actions, security posture, and runtime boundaries.
- Primary workflow: open audit/config, read posture, inspect latest evidence, export if needed.
- Product archetype: operational SaaS / data product.
- Constraints: static HTML/CSS/ES modules, CSP-safe, dark technical design system, Chinese operator copy, stable DOM ids, desktop/mobile support.
- Source of truth: current Admin Console tokens/patterns, frontend specs, UI design skills, existing tests.
- States: audit rows, empty audit list, secure/warn config states, desktop management grid, mobile stacked layout.
- Acceptance: automated assertions plus desktop/mobile rendered QA with overflow and visibility checks.

## Rendering Contract

- `renderAudit()` remains the owner of `auditList` and new audit evidence ids.
- A new audit evidence region is derived only from currently loaded `state.audit`, matching the loaded evidence window rather than claiming full historical coverage.
- `renderConfigSummary()` remains the owner of config text and new config evidence ids.
- Config evidence maps existing sanitized config payload fields into readable posture cells; no raw secrets are rendered.
- Server-provided audit action/detail/actor/target/config strings continue to pass through `esc()` before `innerHTML` insertion.

## Visual Design

- Audit evidence uses four compact cells: reviewed events, failed events/rate, latest actor, export readiness.
- Config evidence uses four compact cells: HTTPS, raw key, path policy, state backend.
- Surfaces reuse existing neutral panel styling, semantic good/warn/bad text, compact type scale, and stable dimensions.
- Mobile stacks the management grid and uses two-column evidence grids only where text can fit cleanly.

## Compatibility

- Existing ids for `auditList`, `auditTotal`, `auditSuccess`, `auditFailure`, `configRawKey`, `configAdminHttps`, and config detail ids remain unchanged.
- Existing E2E role selectors for `审计与配置` and `导出审计` remain valid.
- New evidence strips are additive and should not weaken current audit/config assertions.

## Rollback

Revert the changed Admin UI files, tests, and task-local QA script. No persistent data migration or server rollback is required.
