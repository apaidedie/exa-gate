# Refresh Failure Recovery Panel

## Goal

When Admin Console refresh fails (manual or auto), operators get an in-shell recovery banner with clear copy and a one-click retry, not only a top-bar status chip or a transient toast.

## Requirements

- R1: On refresh failure, show a compact recovery banner with error context and a Retry action.
- R2: Retry reuses the existing `refresh({ force: true })` path and focuses recovery affordance.
- R3: Banner hides on successful sync / while syncing starts after retry.
- R4: Preserve existing `#lastUpdated` refresh status states and manual-click toast behavior.
- R5: Static + E2E coverage for failed → retry → recovered.

## Acceptance Criteria

- [x] Failed refresh shows recovery banner with retry control.
- [x] Retry clears the banner after a successful refresh.
- [x] Desktop + 390px: no document-level overflow; banner does not block primary tabs.
- [x] Focused tests + E2E + `npm run verify` pass.

## Out Of Scope

- Offline queueing, multi-error history, or SSE reconnect redesign.
