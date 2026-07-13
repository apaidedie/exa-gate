# PRD: Governance insight residual landmark live aria polish

## Goal
Enrich residual governance cards, insight cards, auth wrap/access note, panel heads, and modal head/body/foot landmarks with next-action `aria-label` guidance.

## Scope
- `src/admin-ui/index.html` residual sub-region landmarks
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual governance/insight/modal landmarks include purpose + next-action phrasing.
2. Unit pins updated for changed landmarks.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
