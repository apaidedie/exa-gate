# PRD: Nav config focus residual live aria polish

## Goal
Harden remaining single-rAF focus helpers used after tab switches / re-renders so focus lands reliably (double rAF + short retry), aligned with row/detail/alert focus restore.

## Scope
- `src/admin-ui/admin.js`: focusConfigPosture, focusControlInTab, focusKeyFilterChip, focusDetailLogAction
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond focus restore timing

## Acceptance
1. Listed focus helpers use double rAF (+ short retry where re-render is likely).
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
