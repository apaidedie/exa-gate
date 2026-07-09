# Polish audit filtering

## Goal

Make the Audit & Config tab easier to investigate by adding compact audit-list filters, a visible filter-state summary, and a reversible clear path that matches the console's key/log filter behavior.

## Background

The request log and key-pool workflows now expose filter state, chips, and clear actions. The audit panel shows governance summary cards and recent audit evidence, but operators cannot narrow the visible audit records by action, outcome, actor, target, or detail. The existing `exportAudit()` UI action always downloads the broad audit CSV even though backend tests already cover filtered audit export parameters such as `action` and `success`.

## Requirements

- Add compact audit controls in the Audit panel toolbar for keyword, action, and outcome filtering.
- Render an audit filter summary between the panel head and audit evidence area.
- Idle state must be neutral and compact, with a muted `未筛选` chip and hidden clear button.
- Active state must show human-readable chips, visible matched-record count, and a clear action.
- Filtering must apply to the visible audit list and audit evidence counts without mutating the loaded `state.audit` array.
- Keyword filtering must search targeted audit fields only: visible action label, raw action, actor token id, target id, detail, ip, user agent, and timestamp text.
- Action filtering must use known audit action values from the existing UI label map plus an all-actions option.
- Outcome filtering must support all, success, and failure.
- Clear must reset audit keyword/action/outcome filters, re-render audit, and preserve other tab state.
- Audit CSV export must include the selected action and success/failure filters when active. Keyword filtering may remain visible-list only, and the summary/export copy must say so.
- Keep implementation static and CSP-compatible: no dependencies, no inline handlers.
- Preserve mobile density so audit governance cards, controls, and first audit records remain reachable without document-level horizontal overflow.

## Acceptance Criteria

- [ ] Audit filters render in the toolbar with accessible labels and stable controls.
- [ ] Idle audit summary shows neutral copy, `未筛选`, and hidden clear action.
- [ ] Keyword/action/outcome filters update the summary, chips, evidence counts, list contents, and clear-button visibility.
- [ ] Clear resets all audit filters and restores the unfiltered recent audit list.
- [ ] Empty filtered audit results show an audit-specific empty state with a clear path.
- [ ] Audit export includes action/outcome query parameters when those filters are active.
- [ ] Static tests cover HTML/CSS/JS contracts.
- [ ] Playwright covers representative audit filtering, empty state, clear interaction, and filtered export URL behavior.
- [ ] `npm run lint`, focused admin tests, admin-console E2E, and `npm run verify` pass.

## Out of Scope

- Backend route changes or new audit fields.
- Server-side keyword audit search.
- Pagination, saved filters, date-range filters, or advanced query syntax.
- Replacing the governance cards or configuration evidence layout.
