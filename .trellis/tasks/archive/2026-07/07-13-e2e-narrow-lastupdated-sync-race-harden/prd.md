# PRD: E2E narrow lastUpdated sync race harden

## Goal
Apply the same `#lastUpdated` refresh-race harden used in the long console flow to the narrow-viewport global hit-target test.

## Scope
- `test/e2e/admin-console.spec.ts` narrow console refresh status expectations

## Non-goals
- No product behavior change
- Preserve terminal `updated` coverage

## Acceptance
1. Narrow refresh path accepts brief `syncing` and requires terminal `updated`.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
