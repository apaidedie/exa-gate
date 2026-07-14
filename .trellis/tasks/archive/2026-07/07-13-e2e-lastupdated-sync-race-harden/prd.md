# PRD: E2E lastUpdated sync race harden

## Goal
Harden the admin console e2e assertion around manual refresh status so brief `syncing` paint is not required when the delayed keys route resolves before the assertion under load.

## Scope
- `test/e2e/admin-console.spec.ts` refresh status expectations after `#refresh` click

## Non-goals
- No product behavior change
- Preserve coverage of final `updated` state and recovery/failed paths

## Acceptance
1. Refresh path waits for terminal `updated` (or accepts brief `syncing` without hard fail if already updated).
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
