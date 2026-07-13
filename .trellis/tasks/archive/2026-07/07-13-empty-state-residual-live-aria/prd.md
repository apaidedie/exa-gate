# PRD: Empty state residual live aria next-action polish

## Goal
Add next-action `aria-label`s to residual static empty-state action buttons (log/trace/audit) and fill thin login field/error defaults.

## Scope
- `src/admin-ui/index.html` residual empty-action buttons + login field defaults
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Static empty-state action buttons include next-action phrasing matching dynamic empty markup.
2. Login token/error residual labels include next-action guidance.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
