# PRD: Config detail live aria sync next-action polish

## Goal
When `renderConfigSummary` / `renderRetention` update config body values, also refresh parent `config-item` `aria-label`s so focused detail targets keep value + next-action after sync (not only idle HTML defaults).

## Scope
- `src/admin-ui/renderObservability.js` live aria sync for config body items
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Config detail items get live `aria-label` updates with current value + next-action.
2. Unit pins cover new helper / call sites.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
