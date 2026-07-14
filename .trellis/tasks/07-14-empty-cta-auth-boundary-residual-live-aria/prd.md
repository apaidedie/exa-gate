# empty-cta-auth-boundary residual live aria

## Goal
Strengthen residual short empty-state CTA and auth-boundary aria-labels with explicit next-action guidance (session 277).

## Scope
- Auth boundary label: value + next step (continue login)
- Alert empty CTAs (keys / logs): value + idle next-action
- Recent activity empty CTAs: logs / keys / import next-action
- Trend empty CTAs: window switch / log check next-action
- Pin strings in `test/admin.test.ts`

## Acceptance
- `npm run scan:secrets && npm run lint && npm test` → 110
- `npm run test:e2e` → 7
- No React/Tailwind/CDN; preserve DOM ids / data-*
