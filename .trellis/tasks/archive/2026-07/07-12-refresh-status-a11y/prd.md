# Refresh Status Accessible Name

## Goal

Make `#lastUpdated` announce as a console sync status with contextual `aria-label`, matching the live-link status pattern.

## Problem

The refresh chip has short visible copy and `aria-live`, plus `aria-busy` while syncing, but lacks `role="status"` and a framed accessible name (e.g. “控制台同步：同步中”).

## Requirements

- `role="status"` on `#lastUpdated`.
- Dynamic `aria-label` for waiting / syncing / updated / failed.
- Keep dense visible text.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] role + aria-label present and updated.
- [x] Existing refresh recovery still works.
- [x] Verify + e2e green.
