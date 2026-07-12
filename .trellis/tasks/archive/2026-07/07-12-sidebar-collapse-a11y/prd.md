# Sidebar Collapse Accessible State

## Goal

Keep `#sidebarCollapse` accessible name and expanded/pressed state in sync with the persisted sidebar collapse flag.

## Problem

The control updates visible label text (`收起`/`展开`) and icon class, but keeps a static `aria-label="收起侧栏"` and never sets `aria-expanded` / `aria-pressed`, so assistive tech may not know the current rail state.

## Requirements

- On init and toggle, sync:
  - visible label (`收起` / `展开`)
  - icon `is-collapsed` class
  - `aria-expanded` (true when rail is expanded)
  - `aria-pressed` (true when rail is collapsed)
  - `aria-label` (`收起侧栏导航` / `展开侧栏导航`)
- Preserve localStorage `exaSidebarCollapsed` behavior and DOM hooks.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Collapse/expand updates a11y attributes.
- [x] Restored collapsed session still announces correctly.
- [x] Verify + e2e green.
