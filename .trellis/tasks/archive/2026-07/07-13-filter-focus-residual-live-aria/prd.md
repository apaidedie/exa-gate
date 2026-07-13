# PRD: Filter focus residual live aria polish

## Goal
Harden remaining single-rAF focus helpers after log/audit filter reloads so focus lands on the control after async list rebuild.

## Scope
- `src/admin-ui/admin.js`: applyLogStatusFilter, applyLogKeyFilter, runLogDiagnosticAction slowest path, focusAuditSearch, focusAuditOutcomeFilter
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond focus restore timing

## Acceptance
1. Listed filter/audit focus helpers use double rAF + short retry.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
