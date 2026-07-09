# Polish logs trace diagnostics experience

## Goal

Refine the Admin UI request logs tab so operators can understand filtered log posture and inspect a request trace with less manual interpretation.

## Background

- The Admin Console is a static, CSP-safe HTML/CSS/ES module interface in `src/admin-ui/`.
- The request logs tab already supports keyword, path, key, and status filtering, CSV export, log pruning, empty states, and request trace loading.
- Current trace rendering is functional but flat: an active trace lists rows without a compact posture summary, request metadata, or explicit first/last status cues.
- Tests rely on stable ids and selectors including `logFilterSummary`, `logFilterChips`, `clearLogFilters`, `logsBody`, `tracePanel`, `trace-shortcut`, and `trace-item`.
- UI direction: quiet operational SaaS / data product, dense but calm, optimized for incident triage rather than decorative presentation.

## Requirements

- Preserve the static Admin UI stack: no React, router, component framework, external font, CDN, or runtime dependency.
- Preserve existing ids, table columns, and trace click contracts unless tests are intentionally updated.
- Add a compact log diagnostics strip tied to the currently visible rows, showing total visible logs, error count/rate, 429 pressure, and slowest observed latency.
- Keep the log diagnostics strip useful for empty and filtered states without showing misleading numbers.
- Upgrade active trace rendering with a summary area that shows request id, attempt count, final status, key chain, and duration range before the per-attempt list.
- Keep missing and idle trace states clear and mobile-friendly.
- Escape all server-provided log and trace text inserted through `innerHTML`.
- Verify desktop and mobile rendered layout, including no document-level horizontal overflow.

## Acceptance Criteria

- [ ] Request logs tab renders a visible `logDiagnostics` strip with totals and status posture derived from current rows.
- [ ] Filtering logs updates the diagnostics strip and filter summary consistently.
- [ ] Active request trace renders a structured summary plus per-attempt list; existing trace item assertions still pass.
- [ ] Empty and missing trace states remain helpful and do not regress existing shortcuts.
- [ ] Desktop and mobile rendered QA confirm no horizontal overflow and verify log diagnostics, trace summary, and trace list visibility/reachability.
- [ ] `npx vitest run test/admin.test.ts`, `npm run test:e2e`, rendered QA, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass before archive.

## Out of Scope

- Backend log or trace API contract changes.
- Full card-mode replacement of the log table.
- Deep-linking log filters into the URL.
- README screenshot capture changes.
