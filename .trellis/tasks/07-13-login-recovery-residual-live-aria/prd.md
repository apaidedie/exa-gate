# PRD: Login recovery residual live aria next-action polish

## Goal
Enrich residual toast idle, refresh recovery text/banner defaults, asset version, key empty idle landmark, and closed command-palette close control with next-action guidance.

## Scope
- `src/admin-ui/index.html` residual static defaults
- `src/admin-ui/admin.js` recovery text aria-label + closed palette close label
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Toast/recovery/version residual defaults include next-action phrasing.
2. Recovery text JS sets aria-label with value + next step.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
