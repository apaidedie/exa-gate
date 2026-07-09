# Design

## Scope

This task changes the static Admin Console shell only: `src/admin-ui/index.html`, `src/admin-ui/admin.css`, `src/admin-ui/admin.js`, and tests.

## Approach

Replace every decorative glyph with an empty `span` that carries a semantic icon class such as `nav-icon overview-icon` or `login-submit-icon`. CSS pseudo-elements draw the shape using borders, gradients, dots, and short bars. This keeps the UI CSP-compatible and avoids a new icon dependency.

Navigation icons remain decorative and use `aria-hidden="true"`. The button text labels continue to carry meaning. The sidebar collapse button should toggle a CSS class on its icon instead of replacing icon text.

## Visual Direction

Use simple geometric marks that match the dark operational product language:

- Overview: small diamond/grid signal.
- Key pool: circular key-pool/ring signal.
- Request logs: stacked horizontal log lines.
- Audit/config: ring plus center point.
- Collapse: CSS chevron using border rotation.
- Login/security: diamond/ring mark and small arrow drawn by CSS.

## Compatibility

- No DOM ids or data hooks change.
- `collapseLabel` still toggles between `收起` and `展开`.
- LocalStorage collapsed state remains `exaSidebarCollapsed`.
- Mobile and desktop nav both use the same `data-tab` flow.

## Risks

CSS pseudo-elements can disappear if classes are overly specific or hidden by collapsed sidebar rules. Tests should assert class names and rendered visibility, and Playwright should click the collapse control plus each mobile tab.
