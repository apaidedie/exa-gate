# PRD: Overview command residual live aria next-action polish

## Goal
Enrich residual thin overview tabpanel, insight window defaults, recent activity list, log count/pager, details empty actions, and command palette static aria labels with next-action guidance.

## Scope
- `src/admin-ui/index.html` residual static defaults
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual thin static labels include value + next-action phrasing.
2. Unit pins updated for changed defaults.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
