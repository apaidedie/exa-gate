# Ops Strip Status Accessible Labels

## Goal

Frame ops severity, ops alert, and key-health counts as status regions with dynamic accessible labels.

## Problem

`#opsSeverity`, `#opsAlert`, and health counts update as plain text. Assistive tech does not get framed names for current operational posture.

## Requirements

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"` on opsSeverity, opsAlert, and the three health counts.
- Dynamic aria-labels: `运行态势：…` / `运行提示：…` / `健康密钥：N` etc.
- Bad/warn severity uses assertive live on opsAlert only when severity is bad.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present and updated in updateOpsStrip.
- [x] Verify + e2e green.
