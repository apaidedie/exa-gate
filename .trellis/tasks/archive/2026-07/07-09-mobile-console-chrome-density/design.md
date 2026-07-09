# Design

## Scope

This task changes the Admin Console responsive CSS and supporting tests only. It targets mobile shell density and key-pool first-screen usability.

## Approach

The mobile topbar currently keeps every global action as a full grid item, which makes the top chrome about 189px tall at 390px and 760px widths. The compact design should keep every control present but reduce vertical cost by tightening topbar padding/gaps, shrinking the mobile tab rail, and grouping top actions into smaller stable cells.

The key toolbar currently stacks search, chips, and actions into a tall mobile panel. The compact design should keep filter chips in a horizontally scrollable row and arrange key-page actions in a dense grid so the key table begins earlier.

The log toolbar already has a custom six-column mobile grid from the previous task. This task must not override it with generic toolbar rules.

## Boundaries

- `src/admin-ui/index.html` structure and IDs remain stable unless a CSS-only solution proves impossible.
- `src/admin-ui/admin.css` owns layout changes.
- `test/admin.test.ts` should pin important CSS selectors/rules.
- `test/e2e/admin-console.spec.ts` should assert rendered key-row visibility and shell bounds.

## Compatibility

- Desktop layout should remain visually unchanged.
- Mobile `#mobileDetails` still appears only after key selection.
- Existing log controls and trace interactions must remain hit-testable.
- The same DOM controls remain accessible to keyboard and screen readers.

## Risks

Over-compressing controls can make touch targets too small or break existing Playwright selectors. The implementation should reduce container padding and wrapping first, not hide controls or replace buttons with non-semantic elements.
