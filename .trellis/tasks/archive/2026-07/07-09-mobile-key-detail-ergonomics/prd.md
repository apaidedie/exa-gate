# Improve mobile key detail ergonomics

## Goal

Make the Admin Console key detail workflow usable on phone-width viewports. Selecting a key on mobile must reveal the same operational context and detail actions that desktop users get in the right-side detail panel, without breaking the existing desktop aside layout.

## Confirmed Facts

- The Admin Console is a static HTML/CSS/JavaScript UI served from `src/admin-ui/`.
- `src/admin-ui/index.html` has a desktop `<aside id="details">` outside the keys tab.
- `src/admin-ui/admin.css` hides `.details` entirely under `@media (max-width: 1279px)`.
- `src/admin-ui/renderKeys.js` renders all detail content into `#detailsBody`.
- `test/e2e/admin-console.spec.ts` currently verifies mobile navigation but not mobile key detail visibility.

## UI Brief

- Audience: operators managing a self-hosted Exa reverse proxy from desktop or mobile during routine maintenance or incidents.
- Primary workflow: select a key, inspect health/cooldown/failures, then test/reset/enable/disable it.
- Product archetype: operational SaaS console; dense, calm, and action-oriented.
- Constraints: preserve CSP-friendly static UI, existing DOM ids, token-driven CSS, semantic toast tones, and current desktop aside behavior.
- States: selected key, no selected key, operation feedback, empty key pool, mobile and desktop responsive layouts.

## Requirements

- R1: Desktop behavior remains unchanged: the right-side key detail aside continues to render for the keys tab on wide screens.
- R2: Mobile and narrow tablet viewports expose key detail content inside the keys workflow after a key is selected.
- R3: Mobile detail content reuses the same rendering source as desktop detail content so copy, metrics, actions, and operation feedback stay consistent.
- R4: Selecting a key on mobile must move the user to the detail area without horizontal overflow or layout overlap.
- R5: Detail action buttons inside the mobile detail area must operate through the same `data-detail-action` behavior as desktop.
- R6: Empty key pool and filtered-empty states must not show stale detail content.

## Acceptance Criteria

- [ ] Static tests pin the mobile detail container, responsive CSS, and shared render behavior.
- [ ] E2E mobile test selects `key_01_search`, sees its detail content, runs the detail test action, and confirms operation feedback.
- [ ] E2E mobile test confirms horizontal overflow stays within the existing <= 1 px threshold.
- [ ] Existing desktop E2E flow still passes with `#detailsBody` showing selected key details.
- [ ] `npm run lint`, focused UI tests, E2E tests, full test suite, build, verify, and `git diff --check` pass.

## Out Of Scope

- Adding a new frontend framework or component library.
- Redesigning the full key table or replacing desktop aside navigation.
- Changing backend key action APIs.
