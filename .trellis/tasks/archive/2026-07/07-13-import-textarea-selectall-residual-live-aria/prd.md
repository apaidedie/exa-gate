# PRD: Import textarea selectall residual live aria polish

## Goal
Strengthen residual next-action aria for import textarea and select-all keys checkbox (static idle labels).

## Scope
- `src/admin-ui/index.html` importTextarea, selectAllKeys
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve dynamic live labels already set in JS for select-all/import preview

## Acceptance
1. importTextarea aria includes follow-up next-action after precheck.
2. selectAllKeys idle aria includes follow-up next-action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
