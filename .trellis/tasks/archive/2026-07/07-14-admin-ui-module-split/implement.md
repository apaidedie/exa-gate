# Implement: Admin UI B3 Module Split

## Preconditions

- [x] Phase A child complete
- [x] Phase C child complete (tree documented in spec)
- [x] `git status` clean enough to see only B3 work
- [x] User started this task: `python ./.trellis/scripts/task.py start 07-14-admin-ui-module-split`
- [x] Load `trellis-before-dev` before editing

## Checklist

Follow design extraction packages 1→10. After each package:

```bash
npm run lint
npm test
# after UI/static packages:
npm run build
# after session/live/keys/logs or end:
npm run test:e2e
```

- [x] Package 1 ui toast/busy
- [x] Package 2 ui focus/confirm
- [x] Package 3 session auth-ui
- [x] Package 4 live refresh/events
- [x] Package 5 command palette
- [x] Package 6 nav tabs
- [x] Package 7 keys actions (+ import/ops follow-ons)
- [x] Package 8 logs + audit actions
- [x] Package 9 CSS (`css/*` + entry `@import`)
- [x] Package 10 optional state split (`src/state/*` behind `createStateStore`)
- [x] Final `npm run verify` green (110 tests)
- [ ] Final `npm run test:e2e` — blocked this host: Playwright Chromium v1223 download incomplete/slow; re-run after `npx playwright install chromium`
- [x] Update directory-structure specs (frontend + backend)
- [ ] Archive child after gate note

## Rollback

`git revert` last package commit; do not force-push shared history.

## Notes

- `admin.js` orchestrator ~241 LOC (under ~600 target).
- Public imports stable: admin-ui modules via static pipeline; backend `./state.js` facade unchanged.
