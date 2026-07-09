# Log Key Chain Drilldown

## Goal
Make request-log key chains directly actionable by allowing operators to open the related key detail panel from a log row or trace item.

This complements the existing key-detail-to-logs drilldown and closes the common diagnosis loop: suspicious request -> involved key -> key health/actions -> filtered logs.

## User Value
When an operator sees a 429, 5xx, slow request, or multi-attempt trace, they should not have to copy a key id and manually switch tabs/search. The key chain should expose a clear, compact action that opens the matching key detail in the Key Pool and focuses the selected key context.

## Confirmed Facts
- The Admin UI is a CSP-compatible vanilla HTML/CSS/ES module console under `src/admin-ui/`.
- Request logs and traces render key chains through `renderLogs.js` using `keyChainText(log)`.
- Key detail selection already flows through `keyAction(id, 'select')` in `admin.js`.
- `renderKeys()` currently auto-selects a visible row if `state.selectedId` is not on the current filtered page, so a direct key drilldown may need to clear or adjust filters before selecting.
- Existing tests already measure log trace hit targets, detail action hit targets, and document-level horizontal overflow across desktop/mobile.

## Requirements
- Render each known key in log rows and trace items as a semantic button instead of inert text.
- Clicking a log/trace key-chain button must switch to the Key Pool, clear any key search/status filter that would hide the key, select the clicked key, load its failure summary, render details, and focus the selected key detail/action region.
- Unknown, missing, or unavailable key ids must remain readable text and must not render misleading actions.
- Preserve existing request-id trace behavior and table geometry.
- Keep Chinese copy concise and operational.
- Do not add frontend dependencies, routers, icon libraries, external fonts, or backend APIs.

## Acceptance Criteria
- Static/source tests confirm the `data-log-key-action="open-detail"` contract, key-chain button markup, and handler path exist.
- E2E verifies clicking a key-chain button in Request Logs opens the Key Pool, selects that key, shows the key detail panel, and focuses an in-flow detail control.
- E2E verifies clicking a key-chain button inside the trace panel follows the same path.
- E2E verifies desktop and mobile key-chain action hit targets are large enough, unclipped, uncovered, and do not create document-level horizontal overflow.
- `git diff --check`, targeted admin tests, Admin Console e2e, and `npm run verify` pass.

## Out of Scope
- New log APIs or backend query semantics.
- Redesigning the full log table or trace panel.
- Bulk actions from log rows.
- New persistent key filter presets.
