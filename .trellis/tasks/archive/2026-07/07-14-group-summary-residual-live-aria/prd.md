# group-summary residual live aria

## Goal
Session 280 residual live-aria polish: strengthen group/region next-action labels, make audit outcome badges decorative under fully labeled articles, and keep `#commandList` properly closed so `#batchBar` stays top-level (not nested in the hidden command palette).

## Scope
- retryRefresh, keyFilterChips, keyWorkflowSummary, logDiagnostics, commandList next-action aria
- Dynamic keyWorkflowSummary selected/idle strings
- Audit item outcome badge → `aria-hidden` when parent article is fully labeled
- HTML structure: `#commandList` must close before `#commandEmpty`; `#batchBar` remains top-level before `#toast`
- Unit + e2e pin updates

## Acceptance
- `npm run scan:secrets && npm run lint && npm test` → 110
- `npm run test:e2e` → 7
- No React/Tailwind/CDN; preserve DOM ids / data-*
- Do not nest `#batchBar` inside `#commandPalette`
