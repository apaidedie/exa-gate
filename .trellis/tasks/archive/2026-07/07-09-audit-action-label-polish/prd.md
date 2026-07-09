# Polish audit action labels

## Goal

Make the Admin Console audit list readable at a glance by replacing raw internal action codes as the primary label with operator-facing Chinese labels, while retaining the original action code as a secondary technical identifier.

## Confirmed Facts

- The Admin Console is a static HTML/CSS/ES module UI in `src/admin-ui/`; no frontend framework or external assets should be introduced.
- `renderAudit()` in `src/admin-ui/renderLogs.js` currently renders `item.action` directly as the main audit title.
- Backend audit action values include session, key, batch, log, audit export, HTTPS policy, auto-retention, and alert webhook actions such as `login`, `logout`, `test_key`, `batch_disable`, `prune_logs`, `auto_prune_logs`, `export_audit`, and `test_alert_webhook`.
- CSV audit export and backend filtering use the raw action values and should remain unchanged.

## Requirements

- Render a concise human-readable Chinese action label as the primary audit title in the UI.
- Keep the raw action code visible in a small secondary code chip so operators can match UI rows with exported CSV/API data.
- Preserve success/failure badges, timestamp, actor token id, target id, detail, IP/user-agent fallback behavior, escaping, and existing audit data flow.
- Support both known action codes and unknown future action codes without blank or broken labels.
- Keep the audit list compact and responsive in the existing dark operational design language.
- Do not change the audit API, database schema, CSV export, or server-side action strings.

## Acceptance Criteria

- [x] `renderAudit()` no longer uses raw `item.action` as the only primary title.
- [x] Known audit actions render clear Chinese labels, including login, logout, key test, batch actions, imports, exports, pruning, raw key reveal, webhook test, and HTTPS-required failures.
- [x] Unknown audit actions still render a readable fallback and show their raw code.
- [x] Raw action codes remain visible in the audit row as secondary metadata.
- [x] Static UI tests cover the audit label mapping and raw-code chip class.
- [x] E2E coverage confirms the audit tab shows operator-facing labels for a real login/export/webhook flow.
- [x] Rendered desktop and mobile checks show the audit list has no text overlap or horizontal page overflow.

## Out Of Scope

- Changing audit storage, filtering, or export semantics.
- Adding audit filters or pagination.
- Reworking the entire audit/config page layout.
