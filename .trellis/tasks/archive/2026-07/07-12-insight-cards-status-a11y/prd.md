# Insight Cards Status A11y

## Goal

Frame overview insight card titles and texts as status regions with dynamic accessible labels when judgement, next action, and observation window update.

## Problem

Insight cards update title/body as plain text. Assistive tech does not get framed names for current judgement, next action, or observation window.

## Requirements

- `role="status"`, `aria-live`, `aria-atomic="true"` on `#insightJudgementTitle/Text`, `#insightNextActionTitle/Text`, `#insightWindowTitle/Text`.
- Dynamic aria-labels:
  - `当前判断：…` / `当前判断说明：…`
  - `下一步：…` / `下一步说明：…`
  - `观测窗口：…` / `观测窗口说明：…`
- Use `aria-live="assertive"` when tone is `bad`, otherwise `polite`.
- Keep action button labeling; do not put status role on the interactive card shell for next-action.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present in HTML and updated in setInsightCard.
- [x] Verify + e2e green.
