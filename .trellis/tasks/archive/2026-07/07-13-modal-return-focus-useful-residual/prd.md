# PRD: Modal return focus useful residual polish

## Goal
Share the useful interactive return-focus filter across import, command palette, and confirm modal so Escape restore never lands on body/non-interactive containers.

## Scope
- `src/admin-ui/admin.js` isUsefulFocusReturn shared helper + confirm/command/import restore
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Shared isUsefulFocusReturn used by import/confirm/command restore paths.
2. Command/confirm restore fallback to openCommandPalette / null only when useful target missing.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
