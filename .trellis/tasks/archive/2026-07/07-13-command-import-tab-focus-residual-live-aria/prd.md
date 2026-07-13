# PRD: Command import tab focus residual live aria polish

## Goal
Harden remaining immediate/single-rAF focus paths for command palette open/close, import modal open/close return-focus, active tab control after switchTab, and overview import-keys jump.

## Scope
- `src/admin-ui/admin.js`: focusActiveTabControl, open/closeCommandPalette, openImportModal, restoreImportFocus, import-keys overview/command paths
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond focus restore timing
- Do not touch dirty line-ending-only admin.css

## Acceptance
1. Listed focus paths use double rAF + short retry (or scheduleControlFocus).
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
