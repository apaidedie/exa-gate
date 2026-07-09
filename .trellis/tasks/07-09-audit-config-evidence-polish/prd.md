# Polish audit config evidence experience

## Goal

Refine the Admin Console `审计与配置` tab so operators can quickly judge audit evidence health, security posture, and runtime configuration risk without manually reading every audit row or config item.

## Background

- The Admin Console is a static vanilla HTML/CSS/ES module UI in `src/admin-ui/`.
- The audit tab already shows governance cards, audit entries, and runtime config details.
- Current audit entries are useful but flat: operators can see rows, yet there is no compact evidence-quality summary, no clear failure rate, and no distinct configuration posture strip inside the detail area.
- Existing tests cover the tab, governance cards, audit list, config text, and mobile reachability.
- UI direction remains quiet operational SaaS/data product: dense, restrained, scan-first, and Chinese operator copy.

## Requirements

- Preserve static Admin UI constraints: no framework, router, component library, external font, CDN, or runtime dependency.
- Preserve existing tab ids, list ids, config ids, export button id, and Playwright-visible copy unless tests are intentionally updated.
- Add a compact audit evidence summary tied to currently loaded audit rows, showing reviewed events, failure pressure, latest actor, and export readiness.
- Upgrade audit rows with clearer metadata hierarchy: action label/code, status, time, actor, target, and detail should remain escaped and readable on desktop/mobile.
- Add a configuration evidence strip in the config panel that groups admin HTTPS, raw-key reveal policy, path policy, and state backend into compact posture cells.
- Keep empty audit states useful and visually aligned with the rest of the Admin Console.
- Keep mobile layout usable without document-level horizontal overflow or clipped controls.
- Escape all server-provided audit/config text inserted through `innerHTML`.

## Acceptance Criteria

- [ ] Audit tab renders a visible evidence summary region with stable ids and values derived from `state.audit`.
- [ ] Audit evidence summary updates when audit rows are available and includes failure rate / latest actor / export readiness copy.
- [ ] Config panel renders a visible config evidence strip with stable ids and posture text derived from `state.config`.
- [ ] Existing audit row assertions still pass; new assertions cover summary and config evidence copy.
- [ ] Desktop and mobile rendered QA confirm governance, audit evidence, config evidence, audit list, and config panel are visible with no document-level horizontal overflow.
- [ ] `npx vitest run test/admin.test.ts`, `npm run test:e2e`, rendered QA, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass before archive.

## Out of Scope

- Backend audit/config API contract changes.
- Audit filtering/search UI.
- New charting libraries or visual assets.
- README screenshot refresh.
