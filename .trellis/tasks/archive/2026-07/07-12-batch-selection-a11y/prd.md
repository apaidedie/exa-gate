# Batch Selection Status A11y

## Goal

Make batch selection status and the page “select all” control announce selection state clearly to assistive tech.

## Problem

1. `#batchCount` only has `aria-live` and inner HTML; no `role="status"` / atomic label framing the selection count.
2. `#selectAllKeys` never sets `indeterminate` for partial page selection and keeps a static aria-label, so partial selection is invisible to AT.

## Requirements

- `#batchCount`: `role="status"`, `aria-atomic="true"`, dynamic `aria-label` including selected count.
- `#selectAllKeys`: sync `checked` + `indeterminate` from current page vs selected ids; update aria-label for none / partial / all.
- Call sync from `updateBatchBar()` (and clear path).
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] batchCount has status framing and label with count.
- [x] selectAll reflects partial selection via indeterminate + label.
- [x] Verify + e2e green.
