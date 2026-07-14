# command-option audit-evidence residual live aria

## Goal
Session 279 residual live-aria polish: fully label command options (chip decorative), strengthen audit evidence static idle labels, and add next-action to import readiness / command shortcut hint.

## Scope
- Command palette options: parent `aria-label` = title + description + group + next action; chip `aria-hidden`
- Audit evidence static idle buttons: value + next action
- Import readiness group + command shortcut hint next-action
- Unit + e2e pin updates

## Acceptance
- `npm run scan:secrets && npm run lint && npm test` → 110
- `npm run test:e2e` → 7
- No React/Tailwind/CDN; preserve DOM ids / data-*
