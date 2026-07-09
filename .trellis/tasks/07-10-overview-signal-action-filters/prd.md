# Overview Signal Action Filters

## Goal

Make Overview status signals actionable so operators can drill from high-level health, usage, failure, trend, and alert summaries into the relevant console workflow without hunting through tabs and filters.

The result should feel like a compact operations cockpit: dense, calm, and precise. It should use semantic buttons, visible focus, clear hover/disabled states, and the existing dark technical design language.

## Confirmed Facts

- The Admin Console is static vanilla HTML, CSS, and ES modules in `src/admin-ui/`.
- The project has no frontend framework, component library, icon package, animation package, external fonts, or CDN dependencies.
- Overview already has summary cells, insight cards, metric cards, trend recap, alert list, and one existing `insightNextActionButton` action dispatcher.
- Existing navigation actions can switch to keys, logs, overview, and audit tabs and focus specific controls.
- This slice is frontend-only and must not change backend API payloads, storage, or observability aggregation.

## UI Brief

- Audience: technical operators triaging proxy health from the first Overview screen.
- Primary workflow: notice an overview signal, click/focus it, and land on the relevant investigative control or filtered workflow.
- Product archetype: operational SaaS / data product.
- Constraints: preserve current stack, DOM ids, CSP compatibility, repo tokens, mobile 390px reachability, and no new dependencies.
- States: default, hover, focus, active, disabled/no-data, selected tab, mobile stacked layout, and reduced-motion compatibility.
- Acceptance: static contract tests plus Playwright coverage for desktop and mobile drill-down behavior and no page-level horizontal overflow.

## Requirements

- Overview summary/metric signals that represent operator actions must become real `button type="button"` controls, not clickable generic containers.
- Each signal must expose stable `data-overview-signal-action` hooks and descriptive accessible names.
- Signal actions must reuse existing tab-switch/filter/focus behavior where possible:
  - Key health/active-key signals should navigate to the Key Pool and focus or apply the appropriate key scope.
  - Request/usage signals should navigate to Request Logs and focus log search or status controls.
  - Failure/error/rate-limit signals should navigate to Request Logs and apply the matching status filter when a specific filter is implied.
  - Trend/window signals should keep the operator on Overview and focus the time range control.
  - Alert signals should focus the alert list or alert-related next action without triggering network mutations.
- Actions must be focus-safe: after clicking or keyboard activating a signal, focus should land on a visible in-flow control or the activated tab target.
- Visual states must clearly distinguish interactive, focused, active, and disabled/no-data signals without layout shift.
- Mobile layout must keep signal buttons usable as touch targets and must not introduce document-level horizontal overflow.

## Acceptance Criteria

- [ ] Overview summary/metric/action signals expose semantic buttons with `data-overview-signal-action` hooks.
- [ ] Clicking active-key/key-health signals navigates to Key Pool and focuses the relevant key control or filter chip.
- [ ] Clicking request/usage signals navigates to Request Logs and focuses request-log search.
- [ ] Clicking failure and rate-limit signals navigates to Request Logs and applies the matching status filter.
- [ ] Clicking trend/window signals focuses the time range select without leaving Overview.
- [ ] Alert signal actions focus a visible alert or alert next-action control without firing destructive or network-changing operations.
- [ ] Static tests pin DOM hooks, event delegation, dispatcher branches, and CSS states.
- [ ] E2E tests prove desktop and mobile signal actions, focus targets, no clipping/covering of hit targets, and no horizontal overflow.
- [ ] `git diff --check`, lint, targeted static tests, targeted Playwright tests, and full `npm run verify` pass before archiving.

## Out Of Scope

- Backend/API changes.
- New observability metrics or database schema changes.
- External fonts, CDNs, icon libraries, animation packages, or component frameworks.
- Triggering destructive operations such as prune, delete, disable, or webhook sends from overview signals.
- Reworking the whole Overview layout beyond the signal/action affordances needed for this slice.

## Notes

- This is a lightweight frontend enhancement; `prd.md` is sufficient for planning.
