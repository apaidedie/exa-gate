# PRD: Confirm modal residual live aria next-action polish

## Goal
Keep confirm-action modal closed/idle `aria-label`s with next-action guidance instead of stripping labels on close, and fill static HTML idle defaults for title/text.

## Scope
- `src/admin-ui/admin.js` `closeConfirmAction` residual labels
- `src/admin-ui/index.html` confirm modal idle defaults
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Closing confirm modal restores idle next-action labels (not bare remove).
2. Static HTML title/text defaults include next-action phrasing.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
