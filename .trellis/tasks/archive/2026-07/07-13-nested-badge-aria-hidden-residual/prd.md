# PRD: Nested badge aria-hidden residual polish

## Goal
Hide nested decorative status/method badges that sit inside parent controls already carrying full next-action aria-labels (recent activity, alert items, trace shortcuts, readiness heads).

## Scope
- `src/admin-ui/renderKeys.js` recent-activity badge
- `src/admin-ui/renderObservability.js` alert severity badge
- `src/admin-ui/renderLogs.js` trace-shortcut badge
- `src/admin-ui/index.html` readiness method badges
- `test/admin.test.ts` string pins

## Non-goals
- Do not hide standalone live status badges (opsSeverity, trendSummary, etc.)
- No React/Tailwind/CDN

## Acceptance
1. Nested badges use aria-hidden="true".
2. `npm run verify` 110 + `npm run test:e2e` 7 pass.
