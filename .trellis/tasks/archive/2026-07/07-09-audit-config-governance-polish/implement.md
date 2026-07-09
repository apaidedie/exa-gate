# Implementation Plan

## Checklist

1. Update `index.html` audit tab with a governance summary strip while preserving existing audit/config ids.
2. Add `renderAuditSummary()` in `renderLogs.js` and call it from `renderAudit()`.
3. Extend `renderConfigSummary()` and `renderRetention()` in `renderObservability.js` to populate governance posture fields.
4. Add CSS for governance cards, posture rows, improved audit rows, and mobile stacking.
5. Update static tests for the new DOM/classes/renderer functions.
6. Update Playwright audit/config flow assertions and mobile reachability checks.
7. Run targeted tests, rendered QA, then full validation.
8. Mark PRD acceptance complete, commit work, archive task, and record journal.

## Validation Commands

```powershell
npx vitest run test/admin.test.ts
npm run test:e2e
npm run lint
npm test
npm run build
git diff --check
npm run verify
```

## Rendered QA

- Start `npm run demo:ui` with a temporary port.
- Open the audit/config tab after login.
- Check desktop `1440x960` and mobile `390x844`.
- Confirm no document-level horizontal overflow.
- Confirm governance cards, export audit control, audit list, and config body are visible/reachable.

## Risk Points

- Audit and config text comes from server/config state; keep `esc()` for rendered row content and `textContent` for direct id updates.
- Avoid making governance summary depend on observability loading order in a way that throws before config/retention exists.
- Do not weaken existing E2E role selectors when adding new copy.
