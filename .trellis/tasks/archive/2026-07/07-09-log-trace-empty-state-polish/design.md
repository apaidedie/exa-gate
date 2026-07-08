# Log Trace Empty State Design

## Boundaries

- Keep `#logsBody`, `#tracePanel`, and existing log filter controls intact.
- Keep trace data fetched through `fetchLogTrace()` and stored in `state.trace`.
- Change only frontend rendering, copy, styles, and tests.

## Rendering Pattern

- Add small helper renderers in `renderLogs.js` for trace empty states and no-record traces.
- Use escaped HTML for request ids and server-provided fields.
- Use existing badge, mono, and tokenized panel styles.
- Keep the log table as the primary object; trace panel stays below it as contextual diagnostic detail.

## Responsive Behavior

- Desktop trace records use a compact grid: time, request summary, status.
- Mobile trace records collapse to one column with wrapped mono details.
- Empty-state copy uses short operational instructions and compact stat chips, not marketing text.

## Compatibility

- Existing log filter/export flow and trace API contract remain unchanged.
- Existing E2E selectors continue to work because ids and table structure are preserved.
