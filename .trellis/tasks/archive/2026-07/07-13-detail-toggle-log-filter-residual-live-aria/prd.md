# PRD: Detail toggle log filter residual live aria polish

## Goal
1. Strengthen key-detail enable/disable and copy action aria-labels with explicit next-action after audit mention.
2. Strengthen log path/key/status filter controls with next-action after reload mention.

## Scope
- `src/admin-ui/renderKeys.js` detail-actions toggle/copy
- `src/admin-ui/index.html` logPathFilter/logKeyFilter/logStatusFilter
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Detail enable/disable/copy labels include follow-up next-action.
2. Log filter controls include follow-up next-action after reload.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
