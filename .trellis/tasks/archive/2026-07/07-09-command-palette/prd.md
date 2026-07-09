# Add command palette

## Goal

Add a compact command palette to the static Admin Console so operators can jump between primary workspaces and trigger common actions without hunting through the topbar or tab-specific toolbars.

## Background

The console now has richer workflows across keys, logs, audit, import, trace, and config. As the interface becomes more capable, the main navigation and toolbar remain usable but require more pointer travel, especially on mobile or narrow desktop. A command palette is a high-leverage UX improvement for an operational tool: it keeps the interface visually clean while giving experienced operators a fast path to common commands.

## Requirements

- Add a visible command button in the topbar utility group and a keyboard shortcut that opens the palette with `Ctrl+K` or `Cmd+K`.
- Render the palette as a CSP-compatible static dialog: no dependencies, no inline scripts or handlers, and no external assets.
- The dialog must include a search input, grouped command results, empty state, keyboard instructions only where useful, and clear visual focus.
- Commands must support at least:
  - Navigate to Overview, Key Pool, Request Logs, and Audit & Config tabs.
  - Focus key search, log search, and audit search after switching to the relevant tab.
  - Open bulk key import.
  - Trigger refresh, webhook test, request-log export, and audit export.
  - Clear key, log, and audit filters when applicable.
- Search must match command title, group, and keyword aliases such as `keys`, `logs`, `audit`, `import`, `export`, `refresh`, and Chinese labels.
- Keyboard interaction must support ArrowUp/ArrowDown, Enter, Escape, and Tab trapping while open.
- Closing the palette must restore focus to the opener when possible.
- Running commands that depend on existing async handlers must reuse the existing DOM events or shared functions instead of duplicating network calls.
- Keep visual treatment calm and operational: dense, high-contrast, aligned with existing dark technical tokens, with short opacity/transform motion and the global reduced-motion rule.
- Preserve mobile density and avoid document-level horizontal overflow at 390px.

## Acceptance Criteria

- [ ] Topbar exposes a command button with an accessible name and shortcut hint.
- [ ] `Ctrl+K` / `Cmd+K` opens the palette without interfering with text input editing.
- [ ] Palette search filters commands by title, group, and aliases.
- [ ] Arrow key navigation and Enter execute the active command.
- [ ] Escape and outside click close the palette and restore focus.
- [ ] Tab/Shift+Tab stay inside the palette while it is open.
- [ ] Navigation and focus commands switch tabs and focus the expected control.
- [ ] Action commands reuse existing refresh/import/export/test/filter behavior.
- [ ] Empty query results show a polished empty state without layout shift.
- [ ] Static tests cover HTML/CSS/JS contracts.
- [ ] Playwright covers opening, searching, keyboard execution, focus trap, close behavior, mobile visibility, and no horizontal overflow.
- [ ] `npm run lint`, focused admin tests, Admin Console E2E, and `npm run verify` pass.

## Out of Scope

- Backend command registry or new API endpoints.
- Saved/recent commands, user customization, global data search, or fuzzy scoring beyond simple token matching.
- Third-party command palette libraries.
- Replacing existing navigation or toolbar controls.
