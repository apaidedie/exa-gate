# Implement: Admin UI B3 Module Split

## Preconditions

- [ ] Phase A child complete
- [ ] Phase C child complete (tree documented in spec)
- [ ] `git status` clean enough to see only B3 work
- [ ] User started this task: `python ./.trellis/scripts/task.py start 07-14-admin-ui-module-split`
- [ ] Load `trellis-before-dev` before editing

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

- [ ] Package 1 ui toast/busy
- [ ] Package 2 ui focus/confirm
- [ ] Package 3 session auth-ui
- [ ] Package 4 live refresh/events
- [ ] Package 5 command palette
- [ ] Package 6 nav tabs
- [ ] Package 7 keys actions
- [ ] Package 8 logs + audit actions
- [ ] Package 9 CSS
- [ ] Package 10 optional state split
- [ ] Final `npm run verify` + `npm run test:e2e`
- [ ] Update any spec path notes if tree drifted slightly
- [ ] Archive child after parent integration OK (or after child gate if parent defers)

## Rollback

`git revert` last package commit; do not force-push shared history.
