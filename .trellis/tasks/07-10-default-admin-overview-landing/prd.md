# Default Admin Overview Landing

## Goal

Make the Admin Console land on the Overview tab after login so the real first screen matches the README preview and immediately shows the operator's global status: proxy flow, health signals, trends, and alerts.

## Background

- `README.md` and the regenerated desktop screenshot now present the Overview tab as the strongest GitHub-facing first impression.
- `src/admin-ui/state.js` still initializes `activeTab` to `keys`.
- `src/admin-ui/index.html` still marks the desktop and mobile `keys` tabs and the keys panel as active in the static shell.
- `showConsole()` calls `switchTab(state.activeTab || 'keys')`, so the runtime follows the old keys-first default unless the state changes before login.
- The keys tab must remain fully reachable from desktop sidebar, mobile tabs, command palette, and Overview actions.

## Requirements

- Set the authenticated default tab to Overview for fresh sessions.
- Align the static shell's initial active tab, panel visibility, and ARIA selected state with Overview so the DOM contract is coherent before JavaScript refresh completes.
- Preserve existing tab ids, `data-tab` hooks, and event delegation contracts.
- Keep the keys workflow unchanged once the user opens the Key Pool tab.
- Update tests that pin the initial active tab, static shell structure, or admin UI bundle content.
- Do not add new navigation persistence, external dependencies, routes, or backend behavior.

## Acceptance Criteria

- [x] After login, the Overview tab is active and the proxy flow map is visible without first clicking navigation.
- [x] Desktop and mobile static nav markup both mark Overview as selected by default.
- [x] The Key Pool tab remains reachable and existing key table/detail workflows still pass.
- [x] Static tests cover the Overview-first default.
- [x] `git diff --check`, targeted Admin UI tests, and `npm run verify` pass before archive.

## Out Of Scope

- Persisting the last selected tab across browser sessions.
- Reordering tabs or removing the Key Pool tab.
- Changing backend APIs or demo data.
