# PRD: Title pending residual live aria next-action polish

## Goal
Enrich residual thin `title` attributes and pending-button busy `aria-label` with next-action guidance now that static landmarks are largely complete.

## Scope
- `src/admin-ui/index.html` command palette open title
- `src/admin-ui/admin.js` setButtonPending busy aria next-action
- `src/admin-ui/renderLogs.js` log-key-link title next-action
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels/titles

## Acceptance
1. Residual thin titles include next-action phrasing.
2. Pending button busy aria includes wait + continue guidance.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
