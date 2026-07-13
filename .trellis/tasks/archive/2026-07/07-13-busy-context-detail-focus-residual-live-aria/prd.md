# PRD: Busy context detail focus residual live aria polish

## Goal
Pass contextual pending text into `setButtonBusy` call sites, and harden detail-panel focus restore after re-render (aligned with row focus restore).

## Scope
- `src/admin-ui/admin.js` setButtonBusy call sites + detailFocusUntil
- `src/admin-ui/renderKeys.js` syncDetailFocusIntent
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y/focus restore

## Acceptance
1. setButtonBusy call sites use contextual pendingText with next-action busy aria.
2. syncDetailFocusIntent uses double rAF + short retry; detailFocusUntil extended.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
