# PRD: E2E auth trace palette metrics scroll

## Goal
Scroll targets into view before hit-target measurement in remaining page.evaluate metrics helpers (auth entry, log trace, command palette).

## Scope
- `test/e2e/admin-console.spec.ts`:
  - authEntryTargetMetrics
  - logTraceTargetMetrics
  - commandPaletteTargetMetrics

## Non-goals
- No product UI changes
- Preserve metric field shapes / assertion intent

## Acceptance
1. Listed helpers scroll measured elements into view before getBoundingClientRect/elementFromPoint.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
