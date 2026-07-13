# PRD: E2E evaluate metrics scroll harden

## Goal
Scroll targets into view before measuring hit targets in page.evaluate-based metrics helpers (log diagnostics, key workflow, detail actions) so off-screen or partially covered mobile buttons are not false-failed.

## Scope
- `test/e2e/admin-console.spec.ts`:
  - logDiagnosticTargetMetrics
  - keyWorkflowTargetMetrics
  - detailActionTargetMetrics

## Non-goals
- No product UI changes
- Preserve metric field shapes / assertions

## Acceptance
1. Listed helpers call scrollIntoView before getBoundingClientRect/elementFromPoint.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
