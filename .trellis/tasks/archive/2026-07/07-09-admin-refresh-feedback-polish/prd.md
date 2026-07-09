# Polish admin refresh feedback

## Goal

Make Admin Console refresh and live-update feedback feel deliberate and trustworthy. Operators should be able to tell whether the console is waiting, syncing, freshly updated, or failed without reading the refresh button state alone.

## Background

- The Admin Console already has `#lastUpdated`, `#refresh`, `refreshInFlight`, auto-refresh, and SSE snapshot refresh paths in `src/admin-ui/admin.js`.
- Current feedback is minimal: the refresh button changes to `刷新中`, and `#lastUpdated` changes only after a successful refresh.
- The top action bar is density-sensitive on `760px` and `390px` layouts; any new feedback must reuse the existing refresh status chip and avoid adding controls or horizontal overflow.
- This is a static CSP-compatible vanilla UI. No new dependencies, external assets, inline event handlers, or backend contracts should be added.

## UI Brief

- Audience: operators monitoring a self-hosted Exa reverse proxy under normal or degraded conditions.
- Primary workflow: login, refresh or receive live updates, understand whether displayed data is fresh, then act on keys/logs/audit.
- Product archetype: operational SaaS / data product, dark technical art direction.
- Source of truth: existing `src/admin-ui/` patterns, Trellis frontend specs, `ui-design-suite` and `ui-ux-pro-max` operational guidance.
- States: waiting, syncing, updated, failed, hover/focus, reduced motion, desktop/narrow/mobile.

## Requirements

- Reuse the existing `#lastUpdated.refresh-status` chip as the global refresh state surface.
- Show distinct visual/copy states for waiting, syncing, updated, and failed refreshes.
- Set accessible state on the status chip while syncing, including `aria-busy` where appropriate.
- Preserve `refresh()` behavior, `refreshInFlight` deduplication, auto-refresh, SSE snapshot refresh, login flow, and existing `#refresh` button pending behavior.
- Surface refresh failures through both the status chip and existing toast error path.
- Keep mobile/narrow topbar density stable with no document-level horizontal overflow and no overlap with mobile tabs or main content.
- Use existing CSS variables, motion tokens, and reduced-motion coverage; do not add dependencies, icons, fonts, or production inline styles beyond existing safe DOM state updates.

## Acceptance Criteria

- [ ] Static tests pin the refresh status state helper, initial waiting state, syncing copy, failed copy, and CSS state classes.
- [ ] E2E confirms a manual refresh exposes a syncing state and returns to an updated state with the button no longer pending.
- [ ] E2E confirms the refresh status chip has a stable hit/visibility footprint on desktop, `760px`, and `390px` widths with no document-level horizontal overflow.
- [ ] Existing Admin Console E2E flows for login, navigation, refresh, key actions, logs, audit, and empty key import continue to pass.
- [ ] `npm run verify` passes before archiving.

## Out Of Scope

- Backend/admin API changes.
- Changing SSE event payloads or refresh scheduling semantics.
- Adding notifications, history timelines, service-worker cache status, or a new global command bar.
- Reworking the whole topbar layout beyond what is necessary for refresh status states.
