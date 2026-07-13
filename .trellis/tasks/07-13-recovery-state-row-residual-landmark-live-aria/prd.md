# PRD: Recovery state-row residual landmark live aria polish

## Goal
Enrich residual refresh-recovery-copy, ops-card heads (运行态势/链路诊断), and state-row landmarks with next-action `aria-label` guidance.

## Scope
- `src/admin-ui/index.html` residual sub-region landmarks
- `test/admin.test.ts` string pins

## Non-goals
- No React/Tailwind/CDN
- Preserve DOM ids / `data-*`
- No product behavior change beyond a11y labels

## Acceptance
1. Residual recovery/state-row/ops-head landmarks include purpose + next-action phrasing.
2. Unit pins updated for changed landmarks.
3. `npm run verify` 110 + `npm run test:e2e` 7 pass.
