# PRD: Workflow kicker problem residual live aria polish

## Goal
1. Hide decorative key-workflow label kickers (`em`) that sit inside fully labeled action buttons.
2. Strengthen no-problem workflow next-action copy when the problems action is disabled.

## Scope
- `src/admin-ui/index.html` key-workflow-label em aria-hidden
- `src/admin-ui/renderKeys.js` problemAction idle next-step
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Workflow label em elements are aria-hidden.
2. Zero-problem action label includes explicit next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
