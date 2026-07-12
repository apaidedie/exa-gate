# Destructive Confirm Prune Batch Disable

## Goal

Gate high-blast-radius destructive Admin Console actions (log prune, batch disable selected, batch disable problems) behind an in-shell confirm dialog with count/context, focus restore, and cancel-safe paths.

## Requirements

- Clicking `#pruneLogs`, `#batchDisableSelected`, or `#batchDisableProblems` must not call the API until the operator confirms.
- Confirm copy must include actionable context:
  - prune: retention days from `state.observability.retention.days` (default 14) and that only expired logs are removed
  - batch disable: count of selected or problem keys
- Cancel / Escape / overlay click closes without mutation and restores focus to the opener.
- Confirm keeps existing pending spinner / toast / refresh behavior after accept.
- Non-destructive batch actions (enable, reset breaker, test) stay one-click.
- Reuse existing modal tokens (`modal-overlay`, `modal`, `danger-btn`) for visual consistency; CSP-compatible vanilla only.
- Stable DOM ids for E2E: `#confirmActionModal`, `#confirmActionTitle`, `#confirmActionText`, `#confirmActionAccept`, `#confirmActionCancel`.
- Unit pins + E2E cancel/confirm coverage; `npm run verify` green.

## Acceptance Criteria

- [x] Destructive actions open confirm modal instead of immediate API call.
- [x] Cancel path leaves data unchanged.
- [x] Confirm path executes existing prune/batch-disable logic.
- [x] Focus trap + Escape + return-focus work like import modal.
- [x] Desktop + 390px: no document overflow; controls usable.
- [x] `npm run verify` and e2e pass.

## Notes

- Lightweight PRD-only task.
- Do not redesign import modal or batch bar beyond confirm gating.
