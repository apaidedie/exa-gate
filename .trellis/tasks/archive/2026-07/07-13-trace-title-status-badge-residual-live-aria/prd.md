# PRD: Trace title status badge residual live aria polish

## Goal
1. Align log requestId / trace-shortcut titles with aria next-action guidance (not bare id).
2. Add key table status badge aria-label with outcome + next action.

## Scope
- `src/admin-ui/renderLogs.js` trace-shortcut + link-btn titles
- `src/admin-ui/renderKeys.js` status badge aria-label
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`

## Acceptance
1. Trace/requestId button titles include next-action guidance.
2. Key status badge has aria-label with next action.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
