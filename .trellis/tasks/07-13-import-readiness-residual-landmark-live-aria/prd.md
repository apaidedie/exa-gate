# PRD: Import readiness residual landmark live aria polish

## Goal
Enrich residual readiness-command-head, import-readiness-item, and import-dropzone-copy landmarks with next-action `aria-label` guidance.

## Scope
- `src/admin-ui/index.html` residual landmarks
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual readiness command heads and import readiness/dropzone landmarks include purpose + next-action phrasing.
2. Unit pins updated for changed landmarks.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
