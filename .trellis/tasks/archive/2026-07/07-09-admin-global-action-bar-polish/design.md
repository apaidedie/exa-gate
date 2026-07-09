# Design

## Boundaries

- Modify only the static Admin Console frontend files and targeted tests:
  - `src/admin-ui/index.html`
  - `src/admin-ui/admin.css`
  - `src/admin-ui/admin.js`
  - `test/admin.test.ts`
  - `test/e2e/admin-console.spec.ts`
- Preserve all existing DOM ids and `data-*` contracts used by the UI modules and tests.
- Keep the console self-contained under the existing CSP and build copy pipeline.

## UI Brief

- Audience: operators managing a self-hosted Exa reverse proxy under mild time pressure.
- Primary workflow: quickly understand session/security state, refresh cadence, and run global utility actions while staying focused on key/log operations.
- Product archetype: operational SaaS and data product.
- Constraints: static HTML/CSS/ES modules, no new assets/dependencies, dark technical art direction, responsive shell, existing Playwright role selectors.
- States: default, hover, focus, disabled, pending, selected secret-display mode, mobile/narrow wrapping.
- Acceptance: static tests, Playwright flow checks, desktop/mobile rendered QA, full verification suite.

## Structure

- Replace the flat `.top-actions` cluster with semantic subgroups:
  - `.action-group.security-group` for secret display and logout.
  - `.action-group.refresh-group` for auto-refresh, interval, and last-updated status.
  - `.action-group.utility-group` for webhook test and manual refresh.
- Keep button text visible for clarity. Add small CSS-drawn marks only where they improve scanability and do not replace accessible names.
- Use classes such as `.secret-toggle`, `.session-exit`, `.refresh-toggle`, `.refresh-status`, and `.is-plain` for visual state.

## Behavior

- Add a small `syncSecretToggleState()` function in `admin.js`.
- On initialization and after `#toggleSecretDisplay` clicks, set:
  - visible text: `显示原文` when currently masked, `隐藏原文` when currently plain.
  - `aria-pressed`: `false` for masked, `true` for plain.
  - `.is-plain` CSS class when currently plain.
- Preserve existing persistence through `localStorage.setItem('exaSecretDisplay', state.secretDisplay)` and existing re-render calls.

## Responsive Design

- Desktop: keep groups inline, with compact chips and clear separators.
- <=1279px: allow groups to wrap while keeping the brand first and actions readable.
- <=760px: convert `.top-actions` to a dense grid where action groups keep stable heights and do not overlap.
- <=480px: keep labels short and ensure touch targets remain at least 32px high in the existing compact mobile chrome.

## Compatibility And Rollback

- No backend or storage migration.
- If rendered QA shows the topbar consumes too much vertical space, rollback the responsive CSS changes while keeping the state sync behavior.
