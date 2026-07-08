# Mobile Key Detail Ergonomics Design

## Boundaries

- Keep the desktop `#details` aside and `#detailsBody` id intact for existing tests and behavior.
- Add a mobile-only detail panel inside the keys tab with its own body node.
- Reuse one rendering function in `renderKeys.js` so desktop and mobile details share copy, metrics, actions, and feedback.
- Use delegated click handling on both detail bodies for `data-detail-action` buttons.

## Data Flow

1. Key table selection updates `state.selectedId` through `keyAction(id, 'select')`.
2. `renderDetails()` picks the selected key and renders the same detail markup into every detail body target that exists.
3. On mobile select, the UI scrolls the inline mobile panel into view after rendering.
4. Detail action buttons call the same `keyAction(state.selectedId, action)` path as desktop.

## Compatibility

- Desktop CSS continues to show `.details` only when `.has-aside` is active.
- Mobile CSS keeps the desktop aside hidden, but displays the inline panel below the key table.
- Existing ids remain stable; the new mobile body uses a new id and shared detail body class.

## Trade-Offs

- Duplicating the detail DOM in desktop and mobile is acceptable because the hidden mobile panel is small and lets us preserve desktop layout without responsive DOM moves.
- Rendering into multiple bodies is simpler and safer than moving the single `#detailsBody` between containers across breakpoints.
