# Restore Focus After Key Row Actions

## Goal

After table-row key actions (`test` / `reset` / `toggle`) re-render the keys table, restore keyboard focus to the matching row control instead of only restoring detail-panel focus.

## Problem

`detailFocusAction` already restores focus for detail-panel buttons after async refresh. Row mini-buttons in `.action-cell` / enable toggle are replaced on re-render, so keyboard operators lose their place when acting from the table.

## Requirements

- Track row focus intent: key id + `data-action` + short TTL.
- When `keyAction` is invoked from a row `button[data-action]`, set row intent (and do not steal focus to the detail panel).
- When invoked from `button[data-detail-action]`, keep existing detail focus restore.
- After `renderKeys()` rebuilds tbody, focus the matching row control if intent is still valid.
- Unit pins for state fields, intent assignment, and restore helper.

## Acceptance Criteria

- [x] Row-origin actions restore focus to the same `data-action` on that key row.
- [x] Detail-origin actions still restore via `detailFocusAction`.
- [x] `npm run verify` green.
