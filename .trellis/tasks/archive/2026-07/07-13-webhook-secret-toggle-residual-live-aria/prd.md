# PRD: Webhook secret toggle residual live aria polish

## Goal
Strengthen top-action aria next-action guidance for Webhook test and secret display toggle (static + live sync).

## Scope
- `src/admin-ui/index.html` testWebhook, toggleSecretDisplay
- `src/admin-ui/renderKeys.js` syncSecretToggleState
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. testWebhook aria includes explicit next step after feedback.
2. secret toggle aria includes short follow-up next-action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
