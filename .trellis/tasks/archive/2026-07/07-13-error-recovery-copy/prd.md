# Error recovery copy polish

## Goal

Improve high-frequency Admin Console failure copy so users get **what failed + what to do next**, without changing control flow, DOM hooks, or CSP constraints.

## Evidence / problem

- Generic confirm failure toast falls back to bare `操作失败` (no recovery path)
- Clipboard/export/import/webhook failures are terse (`剪贴板写入失败`, `导出失败：未知错误`) while detail panels already have better recovery language
- ui-ux-pro-max: Error Recovery — provide clear next steps; Error Messages must be announced (toasts already use assertive live for bad)

## Requirements

1. Rewrite fallback/error toasts for: confirm actions, clipboard copy, log/audit export, bulk import, webhook test, login catch fallback.
2. Keep messages concise for toast width; include recovery when space allows.
3. Preserve existing 401/423 login API messages (`登录已过期…`, `登录失败次数过多…`) unless clearly improved without breaking e2e pins.
4. Unit pins for new strings; e2e still passes login-expired and webhook toast patterns.
5. Screenshots: login error + (optional) bad toast under `output/session-138-error-copy/`.

## Acceptance Criteria

- [ ] Failure copy includes recovery next step for the targeted paths
- [ ] No DOM id / API contract changes
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)
- [ ] Screenshots captured

## Constraints / non-goals

- No redesign of toast chrome/timing beyond optional bad-tone duration tweak ≤5s
- No new error taxonomy system
- No backend message format changes

## Notes

- Skill: ui-ux-pro-max (error recovery, toast feedback)
