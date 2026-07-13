# PRD: Governance readiness residual live aria next-action polish

## Goal
Enrich residual thin governance / readiness / audit static default `aria-label`s and evidence status next-action guidance so idle/default and live states both speak value + next step.

## Scope
- `src/admin-ui/index.html` residual audit/governance/readiness defaults and group landmarks
- `src/admin-ui/renderLogs.js` `setAuditStatus` evidence next-action args
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual governance/readiness/audit static statuses include next-action phrasing in default HTML.
2. Audit evidence status cells receive explicit next-action via `setAuditStatus`.
3. Group landmarks (stats/posture/readiness/evidence/filter chips) describe purpose + next step.
4. `npm run verify` 110 + `npm run test:e2e` 7 pass.
