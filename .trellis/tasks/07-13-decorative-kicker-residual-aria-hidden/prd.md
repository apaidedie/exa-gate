# PRD: Decorative kicker residual aria-hidden polish

## Goal
Mark residual decorative kicker labels (`*-kicker`, empty-kicker) as `aria-hidden="true"` so screen readers rely on parent landmarks/status with next-action phrasing instead of redundant short labels.

## Scope
- `src/admin-ui/index.html` static kickers
- `src/admin-ui/renderKeys.js` / `renderLogs.js` / `renderObservability.js` dynamic empty/detail kickers
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y attributes

## Acceptance
1. Residual decorative kickers are aria-hidden in HTML and JS templates.
2. Unit pins cover key patterns.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
