# PRD: Keys pager batch residual live aria next-action polish

## Goal
Enrich residual thin key pager, page label, batch bar/count, and nearby idle empty defaults with next-action guidance.

## Scope
- `src/admin-ui/index.html` residual static defaults
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual key pager/page/batch static labels include value + next-action phrasing.
2. Unit pins updated for changed defaults.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
