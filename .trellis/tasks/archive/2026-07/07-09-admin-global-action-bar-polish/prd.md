# Polish admin global action bar

## Goal

Refine the Admin Console global action bar so high-frequency operator controls feel more polished, easier to scan, and safer to use without changing backend behavior or adding frontend dependencies.

## Background

- The Admin Console is a static, CSP-compatible vanilla HTML/CSS/ES module UI in `src/admin-ui/`.
- The existing topbar contains the product brand, secret display toggle, auto-refresh controls, refresh timestamp, webhook test, manual refresh, and logout.
- The current controls work, but they read as a flat cluster of similar buttons. This weakens hierarchy for risky/security-related actions and makes the topbar feel less refined than the rest of the console.
- The repo UI direction is operational SaaS/data product: dense, calm, dark technical surfaces with restrained green/blue, amber warning, and red destructive states.

## Requirements

- Improve the topbar visual hierarchy while preserving the same functional controls and DOM ids used by JavaScript/tests.
- Group topbar controls into readable operational clusters: security/session, refresh cadence/status, and utility actions.
- Make the secret display toggle communicate current state through visible copy and a CSS state class, not only hidden internal state.
- Keep all controls keyboard reachable with visible focus and stable hit targets.
- Preserve the static frontend constraints: no React, no component library, no CDN, no external fonts, no inline script/style, and no new dependency.
- Keep mobile and narrow desktop density compact enough that the key table/log table remains reachable without horizontal page overflow.

## Acceptance Criteria

- [x] `src/admin-ui/index.html` keeps the existing topbar ids (`toggleSecretDisplay`, `autoRefresh`, `refreshInterval`, `lastUpdated`, `testWebhook`, `refresh`, `logout`) and reorganizes only safe structural wrappers/classes.
- [x] `src/admin-ui/admin.css` adds token-driven styling for the grouped topbar controls, visible toggle state, and responsive layouts without layout-shifting hover/focus states.
- [x] `src/admin-ui/admin.js` synchronizes the secret display toggle label/state on initialization and every toggle.
- [x] Playwright covers the topbar grouping/state behavior and verifies narrow layouts still have reachable global action hit targets and no document-level horizontal overflow.
- [x] `npx vitest run test/admin.test.ts`, `npm run test:e2e`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass before the task is archived.
- [x] Rendered QA checks desktop `1440x960` and mobile `390x844` for topbar visibility, hit target reachability, and `overflowX <= 1`.

## Out Of Scope

- Backend API changes.
- Adding a new design system or frontend framework.
- Changing the main table/detail workflows beyond any layout adjustments needed by the topbar.
- Replacing all buttons with icon-only controls; this console should remain text-forward for operational clarity.
