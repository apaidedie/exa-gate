# PRD: Command open residual live aria polish

## Goal
Strengthen `#openCommandPalette` closed-state aria-label (static HTML + close restore) with explicit next-action beyond shortcut only.

## Scope
- `src/admin-ui/index.html` openCommandPalette aria-label
- `src/admin-ui/admin.js` closeCommandPalette openBtn restore aria-label
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve open-state aria (“快速操作已打开…”)

## Acceptance
1. Closed openCommandPalette aria includes next-action (search + Enter).
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
