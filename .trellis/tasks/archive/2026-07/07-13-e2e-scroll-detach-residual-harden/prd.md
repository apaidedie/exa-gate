# PRD: E2E scroll detach residual harden

## Goal
Harden remaining bare `scrollIntoViewIfNeeded()` call sites in admin e2e so auto-refresh re-renders do not fail with "Element is not attached to the DOM".

## Scope
- `test/e2e/admin-console.spec.ts` bare scroll sites (empty clear, retry, export, mobile details, readiness/config/audit/trace panels)

## Non-goals
- No product UI changes
- Preserve assertion intent

## Acceptance
1. Bare scrollIntoViewIfNeeded sites use catch or re-query poll.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
