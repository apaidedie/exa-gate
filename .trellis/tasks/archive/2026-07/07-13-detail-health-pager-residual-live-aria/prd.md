# PRD: Detail health pager residual live aria polish

## Goal
1. Make key-detail health summary a polite live region with outcome + next-action aria.
2. Improve key page-size change and jump-to-page UX with next-action toasts and focus restore; jump uses filtered key set page count.

## Scope
- `src/admin-ui/renderKeys.js` detail-health markup
- `src/admin-ui/admin.js` keyPageSize change + jumpKeyPage
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. detail-health has role/status/aria-live and aria-label with health title + text.
2. page-size/jump give next-action feedback; jump clamps against filtered total pages.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
