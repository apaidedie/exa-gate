# PRD: Config body residual live aria next-action polish

## Goal
Enrich residual config detail body static items (and related key-row action titles) with next-action guidance so focused config targets and hover titles match live-aria pattern.

## Scope
- `src/admin-ui/index.html` config-body items / landmark
- `src/admin-ui/renderKeys.js` key-row action `title` next-action alignment
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels/titles

## Acceptance
1. Config body items include value + next-action phrasing in default HTML.
2. Key-row action titles align with aria next-action guidance.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
