# PRD: Open keys toggle residual live aria polish

## Goal
1. Strengthen audit empty open-keys action aria with next-action after open.
2. Strengthen key-row enable/disable toggle aria with follow-up next-action.

## Scope
- `src/admin-ui/renderLogs.js` / `index.html` open-keys empty action
- `src/admin-ui/renderKeys.js` row toggle aria
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. open-keys empty action includes next-action after opening key pool.
2. row toggle aria includes follow-up after enable/disable click guidance.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
