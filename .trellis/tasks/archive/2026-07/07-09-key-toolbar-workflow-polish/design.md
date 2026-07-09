# Design

## UI Brief

- Audience: self-hosted operators managing a pool of Exa API keys during routine operations or incident response.
- Primary workflow: scan key-pool scope, filter/search, select keys, and take safe batch actions.
- Product archetype: operational SaaS / data product.
- Constraints: static HTML/CSS/ES modules, existing dark tokens, Chinese UI copy, no new dependencies, desktop/mobile rendered QA.
- Source of truth: current Admin Console design language, Trellis frontend specs, `ui-design-suite`, and `ui-ux-pro-max` guidance.
- States: default, searched, filtered, empty filtered, selected keys, mobile, loading after refresh.
- Acceptance: static assertions, e2e interaction checks, rendered QA, full `npm run verify`.

## Boundaries

- `src/admin-ui/index.html`: add static container for the key workflow summary inside the key panel.
- `src/admin-ui/admin.css`: style summary with stable responsive grid constraints and existing status colors.
- `src/admin-ui/renderKeys.js`: derive summary from current filtered/page/selection state during `renderKeys()`.
- Tests: update static bundle assertions and e2e key workflow checks.

## Interaction Model

- Summary sits below the panel head and above the table, not inside the table or batch bar.
- It should be glanceable: four compact cells, each one line of label plus value/hint.
- Selection count mirrors the batch bar but remains visible near filters.
- Scope copy should distinguish full pool, status filter, search query, and combined filter/search.

## Accessibility And Motion

- Summary uses `aria-live="polite"` so updates are available without adding interactive focus targets.
- No new motion is required; existing tab enter and reduced-motion rules are enough.
- Summary cannot rely on color alone; labels and values carry meaning.

## Tradeoffs

- Do not add new table controls; the change improves comprehension around existing controls.
- Do not compute server-side counts; use current client state to avoid API contract churn.
- Keep copy short to preserve dense tool ergonomics.

