# PRD: Trace summary log metrics residual live aria polish

## Goal
1. Make request-trace summary a polite live region with outcome + next-action aria.
2. Add next-action aria for log latency/attempts cells and key-row-signal role=status.

## Scope
- `src/admin-ui/renderLogs.js` renderTraceSummary + log latency/attempts
- `src/admin-ui/renderKeys.js` key-row-signal role
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. trace-summary has role/status/aria-live and aria-label with next action.
2. log latency/attempts cells include aria-label with next action.
3. key-row-signal has role="status".
4. `npm run verify` 110 + `npm run test:e2e` 7 pass.
