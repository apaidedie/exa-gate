# PRD: Button busy residual live aria next-action polish

## Goal
Enrich `setButtonBusy` so busy controls announce wait + next-action guidance (aligned with `setButtonPending`), then restore previous labels.

## Scope
- `src/admin-ui/admin.js` `setButtonBusy`
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. `setButtonBusy` sets `aria-label` with pending next-action guidance and restores prior label.
2. Unit pins cover busy aria pattern.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
