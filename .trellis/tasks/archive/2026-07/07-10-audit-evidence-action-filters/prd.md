# Audit Evidence Action Filters

## Goal

Make the Audit & Config tab evidence summaries actionable so operators can move from governance signals to the relevant filter, search, export, or configuration evidence without scanning for the matching control.

The UI should remain dense, calm, and operational: real semantic controls, stable sizing, clear disabled states, and restrained dark technical styling that fits the existing admin console.

## Confirmed Facts

- The admin UI is static vanilla HTML, CSS, and ES modules.
- The project does not currently use a frontend framework, component library, external icon set, animation package, CDN, or external font.
- Existing audit controls include search, action filter, outcome filter, clear filters, export, audit evidence cards, and config evidence cards.
- This slice is frontend-only and should not change backend APIs, audit row shape, or export parameter semantics.

## UI Brief

- Audience: technical operators and maintainers reviewing proxy security and audit evidence.
- Primary workflow: inspect an audit signal, apply the matching filter/search, and continue investigation without leaving the Audit & Config tab.
- Product archetype: operational SaaS / data console.
- Constraints: keep current stack and tokens, maintain CSP-friendly markup, preserve mobile reachability around 390px, and avoid dependencies.
- States: default, hover, focus, active, disabled, filtered-empty, no-audit-data, and mobile stacked layouts.
- Acceptance: static tests plus Playwright coverage for desktop and mobile interaction paths.

## Requirements

- Audit evidence metrics must be rendered as real `button type="button"` controls with stable accessible names and `data-audit-evidence-action` hooks.
- The total/reset evidence action must clear all audit filters, re-render the audit list, and restore focus to the audit search or filter summary path.
- The failure evidence action must apply the `failure` outcome filter, re-render, and focus the outcome filter or its visible failure chip. It must be disabled when there are no failures in the current evidence scope.
- The latest actor/action evidence action must narrow the audit search to the latest available actor or action value and focus the search field. It must be disabled when no audit rows are available.
- The export evidence action must trigger the same audit export behavior as the existing export button when rows are available. It must be disabled when no exportable rows exist.
- Config evidence cards may gain focus-only actions where useful, but must not trigger destructive or state-changing operations.
- Visual states must clearly distinguish interactive, focused, active, and disabled evidence items without layout shift.
- Mobile layout must keep evidence actions usable as touch targets and must not introduce document-level horizontal overflow.

## Acceptance Criteria

- [ ] Audit evidence markup exposes semantic button controls for total/reset, failures, latest actor/action, and export evidence.
- [ ] Clicking total/reset clears audit search, action filter, and outcome filter, then restores the idle audit summary.
- [ ] Clicking failures applies the failure outcome filter and shows only failed audit rows; the action is disabled when the current evidence scope has zero failures.
- [ ] Clicking latest actor/action narrows the search to the latest audit actor or action and focuses the search input.
- [ ] Clicking export evidence reuses the existing audit export flow and preserves existing export query parameter behavior.
- [ ] Static tests pin the DOM hooks, event handling, and CSS interaction states.
- [ ] E2E tests prove desktop evidence actions, disabled/no-data behavior where feasible, audit export behavior, and mobile no-horizontal-overflow/reachability.
- [ ] `git diff --check`, lint, targeted unit/static tests, targeted Playwright tests, and full verification pass before archiving.

## Out Of Scope

- Backend audit schema changes.
- Authentication/session policy changes.
- New dependencies, external fonts, CDN assets, or animation libraries.
- Changing audit export parameters beyond routing through the existing export control.
- Triggering destructive cleanup or prune behavior from evidence cards.

## Notes

- This is a lightweight frontend enhancement; `prd.md` is sufficient for planning.
