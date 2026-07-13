# PRD: Ops readiness residual landmark live aria polish

## Goal
Enrich residual ops-card and readiness-command landmarks with next-action `aria-label` guidance.

## Scope
- `src/admin-ui/index.html` residual ops cards + readiness command articles
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual ops-card and readiness-command landmarks include purpose + next-action phrasing.
2. Unit pins updated for changed landmarks.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
