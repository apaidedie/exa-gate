# Project Polish And Admin UI Refactor

## Goal

Raise `exa-reverse-proxy` from a functional self-hosted Exa API proxy to a release-quality project with a refined static Admin Console, clearer operator copy, stronger responsive behavior, and a more compelling first-run experience while preserving the existing secure reverse-proxy contract.

## Background And Confirmed Facts

- The repository is `https://github.com/apaidedie/exa-reverse-proxy` and the current local branch is `main` with a clean worktree before this task.
- The package is a Node.js 22 TypeScript Fastify service with SQLite state, Prometheus metrics, Grafana assets, Docker support, and a static Admin Console.
- The Admin Console lives in `src/admin-ui/` as vanilla HTML, CSS, and ES modules. It is served by `src/admin/static.ts` under a strict CSP and copied by `scripts/copy-admin-ui.mjs` during build.
- Project frontend guidelines require the console to remain static: no React, router, component framework, external fonts, CDN assets, inline handlers, or ordinary new runtime dependencies.
- Existing Playwright coverage in `test/e2e/admin-console.spec.ts` depends on stable ids and role selectors for login, key details, key testing, log filtering/export, and webhook testing.
- The current UI already exposes key pool management, logs, trace details, audit/config, observability, bulk import, batch actions, session auth, and SSE refresh.

## Requirements

- Preserve all existing backend API behavior, admin auth behavior, key management workflows, logs, audit, observability, batch operations, and demo UI startup behavior unless a change is explicitly needed for quality.
- Refactor the Admin Console visual system into a coherent dark technical operations UI with restrained color, clear hierarchy, compact density, and polished but non-decorative motion.
- Improve the first-run and daily-operator experience: login copy, top actions, navigation, key table, detail panel, logs, alert/observability panels, empty states, toasts, modal states, and responsive layout should feel deliberate and production-ready.
- Keep DOM ids, `data-*` hooks, ARIA roles, module boundaries, CSP compatibility, and static asset manifest behavior intact.
- Add or improve only useful functionality that fits the existing product surface and can be verified locally without broad backend churn.
- Remove or reduce unnecessary visual complexity, duplicate CSS override layers, weak copy, layout-shifting states, and mobile overflow risks.
- Verify through type checks, unit/integration tests, build, E2E coverage, and rendered desktop/mobile UI checks when feasible.

## UI Brief

- Audience: self-hosting developers, platform operators, and teams managing multiple Exa API keys under production pressure.
- Primary workflow: quickly understand proxy health, identify unhealthy keys, test/reset/disable keys, inspect recent request failures, and export logs or audit evidence.
- Product archetype: operational SaaS and data product, not a marketing landing page.
- Art direction: quiet premium operations desk; deep neutral surfaces, semantic green/blue/amber/red status language, crisp tables, visible focus states, compact controls, and subtle cause-and-effect transitions.
- Constraints: vanilla HTML/CSS/ESM, no external assets or fonts, strict CSP, existing Chinese UI copy, stable Playwright selectors, desktop and mobile support.
- Required states: default, hover, focus, disabled, loading, empty, selected, warning/error, modal open/closed, collapsed sidebar, batch selected, reduced-motion.

## Acceptance Criteria

- [ ] Admin Console visual system is consolidated enough that the final render layer no longer feels like an ad hoc patch stack.
- [ ] Console remains usable and polished at desktop and mobile widths with no document-level horizontal overflow from the shell, topbar, panels, tables, batch bar, or modal.
- [ ] Key pool, detail panel, logs, observability, audit/config, import modal, batch bar, and toast states keep their existing workflows and selectors.
- [ ] UI copy is clearer and more operator-focused without adding explanatory marketing text inside the app.
- [ ] Interactive controls have stable hover/focus/disabled/loading states and respect `prefers-reduced-motion`.
- [ ] `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass, or any failure is documented with root cause and next action.
- [ ] A rendered browser check covers at least one desktop viewport and one mobile viewport after implementation.

## Out Of Scope

- Replacing the static Admin Console with React, Vue, Svelte, Tailwind, shadcn, or another frontend runtime.
- Redesigning backend proxy semantics, retry policy, encryption, authentication, or storage unless a small supporting change is necessary.
- Adding hosted SaaS features, external analytics, external fonts, telemetry, or third-party UI assets.
- Guaranteeing GitHub star count; the task targets the quality bar that makes the project more star-worthy.

## Open Questions

None. The user granted full product and implementation discretion, and repository constraints answer the remaining framework and safety decisions.
