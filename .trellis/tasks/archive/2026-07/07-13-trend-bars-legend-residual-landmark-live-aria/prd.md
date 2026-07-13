# PRD: Trend bars legend residual landmark live aria polish

## Goal
Enrich residual trend-bars chart region and trend-legend landmarks with next-action `aria-label` guidance, including live empty/active chart state.

## Scope
- `src/admin-ui/index.html` residual trend chart landmarks
- `src/admin-ui/renderObservability.js` live trendBars aria sync
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Trend bars and legend landmarks include purpose + next-action phrasing.
2. Live render updates trendBars aria for empty vs active windows.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
