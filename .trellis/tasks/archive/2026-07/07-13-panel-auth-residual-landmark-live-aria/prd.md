# PRD: Panel auth residual landmark live aria polish

## Goal
Enrich residual auth screen, login form, sidebar, console shell, and panel landmarks (trend/alert/keys/log/audit/management-grid) with next-action `aria-label` guidance.

## Scope
- `src/admin-ui/index.html` residual landmarks
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual auth/sidebar/panel landmarks include purpose + next-action phrasing.
2. Unit pins updated for changed landmarks.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
