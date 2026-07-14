# dismiss-controls residual live aria

## Goal
Strengthen residual short dismiss controls and key-detail status labels with follow-up next-action guidance (session 278).

## Scope
- Import close/cancel, confirm close/cancel, command close, mobile details close (static + dynamic)
- Key detail health + operation feedback aria next-action
- Pin strings in `test/admin.test.ts`

## Acceptance
- `npm run scan:secrets && npm run lint && npm test` → 110
- `npm run test:e2e` → 7
- No React/Tailwind/CDN; preserve DOM ids / data-*
