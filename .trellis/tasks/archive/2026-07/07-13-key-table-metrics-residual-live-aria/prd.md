# PRD: Key table metrics residual live aria polish

## Goal
Add next-action aria-labels to key-table identity and metric cells (id, requests, success, failures, rate limits, timeouts).

## Scope
- `src/admin-ui/renderKeys.js` key row metric cells
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Key id and metric cells include aria-label with value + next action.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
