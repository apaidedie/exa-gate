# PRD: Import modal residual live aria next-action polish

## Goal
Keep next-action guidance on import-modal closed controls, login error live status, and refresh-retry idle/hidden states.

## Scope
- `src/admin-ui/admin.js` closeImportModal, setLoginError, setRefreshRecovery residual labels
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Closed import modal close/cancel labels keep “返回密钥池” next-action.
2. Login error live aria includes message + next step (idle and error).
3. Refresh retry keeps full next-action even when recovery hidden.
4. `npm run verify` 110 + `npm run test:e2e` 7 pass.
