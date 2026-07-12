# Key Action Export Pending Feedback

## Goal

Give slow key-row/detail actions and CSV exports the same pending spinner/disable pattern already used by batch, refresh, and filters—so operators know work is in flight and cannot double-submit.

## Requirements

- Row actions `test` / `reset` / `toggle` (enable|disable) and detail actions `test` / `reset` / `enable` / `disable` / `copy` set `data-pending` + `aria-busy` on the source control via `setButtonPending` until settle.
- `#exportLogs` / `#exportAudit` pending while download fetch runs; toast success/failure.
- `#confirmImport` uses `setButtonPending` (spinner token) instead of text-only disabled.
- `select` / `logs` navigation actions stay light (no long-running pending required).
- Clear pending on success and error; session-expiry path still works.
- Unit pins; e2e or unit for export pending string / keyAction source button wiring.
- CSP vanilla; preserve DOM hooks.

## Acceptance Criteria

- [x] Async key actions accept optional source button and apply pending labels.
- [x] Export buttons pending + toast.
- [x] Import confirm uses setButtonPending.
- [ ] `npm run verify` + e2e green.
