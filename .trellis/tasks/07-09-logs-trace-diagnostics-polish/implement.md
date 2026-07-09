# Implementation Plan

## Steps

1. Add `logDiagnostics` placeholders to the logs tab under the filter summary.
2. Extend `renderLogs.js` with helpers for row diagnostics, latency parsing, trace summaries, and key-chain formatting.
3. Update CSS for the diagnostics strip, active trace summary, attempt metadata, and mobile layout.
4. Update static and E2E tests for the new log diagnostics and trace summary while preserving existing selectors.
5. Add a task-local rendered QA script for desktop and mobile logs/trace checks.
6. Run focused tests, rendered QA, full verification, and diff hygiene.
7. Commit implementation, archive task, record journal.

## Validation Commands

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- Rendered QA script in `.trellis/tasks/07-09-logs-trace-diagnostics-polish/`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm run verify`

## Risk Points

- Trace panel content is replaced after async trace loads; rendered QA must wait for stable visible text and query the current DOM.
- Wide log table remains intentionally scrollable; QA should check document overflow, not table overflow.
- Query/path/key/status filtering can produce empty rows; diagnostics must not imply healthy traffic when there are no visible rows.
- `innerHTML` rendering must continue escaping server-provided values.

## Review Gates

- Before coding: frontend specs and UI QA references are read.
- Before full verification: focused static and E2E tests pass.
- Before archive: rendered QA records desktop and mobile measurements and screenshots under ignored output paths.
