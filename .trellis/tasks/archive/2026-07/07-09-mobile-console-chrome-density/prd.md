# Improve mobile console chrome density

## Goal

Make the mobile Admin Console feel more like a usable operational workspace by reducing fixed top chrome and key-page toolbar height, so real data appears earlier without breaking navigation, refresh controls, filters, or touch hit targets.

## Evidence

- Rendered audit after the README preview task showed no document-level horizontal overflow at 1440x960, 1024x768, 760x844, or 390x844.
- At 390x844, the mobile topbar was 189px tall, the active content area began around y=252, the keys panel head was 315px tall, and the key table did not begin until around y=568.
- At 760x844, the topbar was also 189px tall and the keys panel head was 235px tall.
- The request-log tab was recently improved and now shows 9 rows at 390x844 in the audit, so this task should preserve log density while focusing on shell chrome and the key-pool first screen.
- Existing E2E already checks mobile navigation, global action hit targets, log visible rows, and no horizontal overflow.

## Requirements

- Compress mobile topbar and mobile tab chrome at widths up to 760px without removing core controls: secret display, auto-refresh, interval, last-updated status, webhook test, refresh, and logout.
- Improve the key-pool tab first-screen density at 390x844 and 760x844 by reducing toolbar wrapping cost and getting key rows visible earlier.
- Preserve all existing DOM ids, `data-*` hooks, and tab semantics.
- Preserve existing log-tab density and hit-target behavior from prior tasks.
- Keep the static vanilla HTML/CSS/ES module stack. Do not add dependencies, external assets, or inline scripts/styles.

## UI Brief

- Audience: operators checking an Exa key pool from a narrow browser or phone-sized viewport.
- Primary workflow: log in, reach the key pool, see key rows and key actions without excessive scrolling.
- Product archetype: operational SaaS / data product.
- Source of truth: existing Admin Console, frontend spec, rendered audit, and `ui-ux-pro-max` operational dark UI guidance.
- States to preserve: desktop, tablet, 760px mobile, 390px mobile, logs tab, audit tab, mobile detail panel after selecting a key, focus/disabled states.
- Acceptance: CSS/static tests plus Playwright assertions on key row visibility, topbar height, no overflow, and existing log/control hit-target behavior.

## Acceptance Criteria

- [x] At 390x844 after login on the key-pool tab, the topbar is materially shorter than the current 189px audit baseline and at least 3 key rows are visible before selecting a key.
- [x] At 760x844 after login on the key-pool tab, at least 5 key rows are visible and the key table starts earlier than the current y≈488 audit baseline.
- [x] Existing mobile navigation can still reach overview, keys, logs, and audit tabs, with no document-level horizontal overflow.
- [x] Existing log-tab assertions remain true: mobile visible log rows, filter controls, trace shortcuts, and action hit targets still work at 390x844 and 760x844.
- [x] Static tests cover the new compact mobile chrome/key-toolbar CSS so regressions are caught without relying only on screenshots.
- [x] Validation passes: targeted Admin UI tests, Playwright E2E, lint, full tests, build, verify, and rendered QA notes for 390x844 / 760x844.

## Out Of Scope

- No backend behavior changes.
- No new Admin Console features or API fields.
- No new navigation model, icon set, framework, dependency, or CSS build step.
- No redesign of desktop density unless required to preserve consistency.
