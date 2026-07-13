# PRD: E2E metrics detach harden

## Goal
Harden e2e hit-target metric helpers that still use ElementHandles so auto-refresh re-renders do not throw "Element is not attached to the DOM" during scrollIntoViewIfNeeded.

## Scope
- `test/e2e/admin-console.spec.ts` metrics helpers:
  - auditEvidenceTargetMetrics
  - keyRowSignalMetrics
  - configPostureTargetMetrics
  - readinessCopyTargetMetrics
  - overviewSignalTargetMetrics (already partially hardened)

## Non-goals
- No product UI changes
- Preserve metric field shapes / assertions

## Acceptance
1. Listed helpers re-query by index (or try/catch skip detach) instead of holding ElementHandles through scroll/evaluate.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
