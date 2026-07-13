# PRD: Empty refresh residual live aria polish

## Goal
Strengthen empty-state refresh-logs / refresh-audit button aria-labels with explicit next-action after reload mention.

## Scope
- `src/admin-ui/renderLogs.js` empty refresh actions
- `src/admin-ui/index.html` static empty refresh actions
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Refresh empty actions include next-action after 重新载入最近窗口.
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
