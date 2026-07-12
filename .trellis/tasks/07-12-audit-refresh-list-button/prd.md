# Audit Refresh List Button

## Goal

Mirror logs: add an honest “刷新列表” control on the audit toolbar that re-fetches the recent audit window (limit 12), with pending feedback—closing the gap where empty-state chips say “刷新审计” but no control exists.

## Requirements

- `#refreshAuditList` button: label `刷新列表`, aria-label reloads recent admin audit window.
- Click: `setButtonPending` → `GET /_proxy/audit?limit=12` → update `state.audit` → `renderAudit` → toast on failure.
- Empty state: chip/action for `refresh-audit` when useful (at least filtered empty can keep clear; empty list gets refresh CTA).
- Unit pins; verify green.

## Acceptance Criteria

- [x] Button present in audit tools.
- [x] Reloads audit API with pending.
- [ ] Verify green.
