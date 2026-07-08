# Polish log trace empty states

## Goal

Improve the Admin Console request-log troubleshooting workflow by turning the trace panel and log empty states into clear, stable operational states. Operators should immediately understand what to do before selecting a request, when filters return no rows, and when a trace lookup returns no linked records.

## Confirmed Facts

- `src/admin-ui/renderLogs.js` owns request log rows, audit list rendering, and trace panel rendering.
- `src/admin-ui/index.html` currently initializes `#tracePanel` with a plain `.empty` message.
- `src/admin-ui/admin.css` has trace layout rules but no rich trace empty-state pattern.
- Existing E2E coverage reaches the logs tab and filters 5xx logs, but does not click a request ID or verify trace panel states.

## UI Brief

- Audience: operators debugging failed or slow proxy requests.
- Primary workflow: filter logs, open a request trace, inspect method/path/key chain/status without losing table context.
- Product archetype: operational SaaS console; compact, calm, and diagnostic.
- Constraints: keep the static vanilla UI, preserve ids and `data-*` hooks, use existing CSS tokens, and keep tables internally scrollable.
- States: initial no-trace selection, filtered-empty logs, trace with records, trace without records, mobile and desktop layouts.

## Requirements

- R1: The initial trace panel must explain that selecting a request ID opens the full chain, using a structured diagnostic empty state rather than a single sentence.
- R2: Filtered-empty logs must clearly distinguish between no matching filter results and an empty log store.
- R3: Trace rendering must use stable, token-driven components that do not resize unpredictably or force document-level horizontal overflow.
- R4: Trace rows must remain readable on mobile by wrapping into a one-column layout without clipping request details.
- R5: Existing log export, filter, and navigation flows must continue to work.

## Acceptance Criteria

- [ ] Static tests pin the richer log empty and trace empty markup/classes.
- [ ] E2E desktop flow opens a request trace from the log table and sees request chain content.
- [ ] E2E mobile flow reaches logs, opens a trace, and remains within the existing horizontal overflow threshold.
- [ ] Rendered QA confirms desktop and mobile trace states have no document-level horizontal overflow.
- [ ] `npm run lint`, focused UI tests, E2E tests, full tests, build, verify, and `git diff --check` pass.

## Out Of Scope

- Changing backend trace APIs or log retention behavior.
- Adding charts, canvases, or external UI libraries.
- Redesigning the whole log table.
