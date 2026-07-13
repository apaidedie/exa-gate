# PRD: Proxy readiness residual landmark live aria polish

## Goal
Enrich residual proxy-flow-copy, readiness-overview/copy, mobile details head/body, config title, ops-card-head, and command empty-actions landmarks with next-action `aria-label` guidance.

## Scope
- `src/admin-ui/index.html` residual sub-region landmarks
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual proxy/readiness/mobile/command landmarks include purpose + next-action phrasing.
2. Unit pins updated for changed landmarks.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
