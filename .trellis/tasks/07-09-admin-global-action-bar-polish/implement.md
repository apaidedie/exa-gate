# Implementation Plan

## Checklist

1. Update `index.html` topbar markup with action-group wrappers and state-specific classes while preserving ids and visible labels.
2. Add token-driven CSS for grouped actions, secret display state, refresh status, session exit tone, and responsive topbar grids.
3. Add `syncSecretToggleState()` in `admin.js` and call it on initialization plus secret-display toggle changes.
4. Add/adjust static tests in `test/admin.test.ts` for the new topbar structure, state function, and preserved ids.
5. Add/adjust Playwright tests in `test/e2e/admin-console.spec.ts` for secret toggle state and narrow topbar hit targets.
6. Run targeted validation, rendered QA, then full validation.
7. Mark PRD acceptance criteria complete, commit work files, archive task, and record the journal.

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

- Use Playwright or an equivalent browser check at `1440x960` and `390x844`.
- Confirm `document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1`.
- Confirm `#toggleSecretDisplay`, `#refresh`, `#testWebhook`, and `#logout` are visible/reachable and do not overlap neighboring controls.
- Confirm the mobile key/log primary rows remain visible enough for the existing E2E thresholds.

## Risk Points

- Existing role selectors depend on visible button labels; keep labels stable enough for tests or update tests for intentional copy.
- Topbar height is already tightly constrained on mobile; CSS must prioritize compact grouping over decorative spacing.
- Pending buttons use `setButtonPending()` and overwrite text temporarily; the secret toggle state function should not run while the toggle button is disabled/pending because it is not an async pending button.
