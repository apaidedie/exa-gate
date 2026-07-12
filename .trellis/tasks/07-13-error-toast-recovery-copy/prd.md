# Error toast recovery copy

## Goal

Bare catch-path toasts that only show `error.message` also include a short recovery next step (check network/permission/filters, then retry).

## Evidence

- Session 138 improved some failure toasts; ~29 catch sites still use `showToast(error.message, 'bad')`
- ui-ux-pro-max: errors need clear recovery, not bare technical messages
- Bad toasts already stay 4.8s for readability

## Requirements

1. Add `showErrorToast(error, fallback?)` that appends recovery guidance when missing
2. Route bare catch handlers through it; keep already-specific failure copy
3. Avoid double-suffix when message already contains recovery phrases
4. Unit pin helper + representative catch sites
5. Screenshot toast on failure path if feasible, else unit + e2e green

## Acceptance

- [ ] showErrorToast in admin.js
- [ ] bare catch paths use showErrorToast
- [ ] verify 110 + e2e 7
