# Empty and command recovery copy

## Goal

Clarify empty-state and command-palette “no match” copy so users know **what happened** and **what to try next**, without changing layout, DOM hooks, or CSP.

## Evidence / problem

- Command empty is terse: “没有匹配的操作” + short keyword hints
- Some empty paths already have CTAs (filter clear); others can be clearer on recovery
- Session 138 polished failure toasts; empty/no-match states are the next high-frequency guidance surface
- ui-ux-pro-max: Error Recovery / clear next steps for dead-ends

## Requirements

1. Improve `#commandEmpty` title/body with recovery-oriented wording; keep e2e substring `没有匹配的操作` or update e2e together.
2. Tighten high-traffic empty messages for log filtered empty, audit filtered empty, and missing-trace (requestId) empty if still weak.
3. Improve warn toasts for empty diagnostics: slowest log sample / latest audit clue.
4. No markup structure changes beyond text content.
5. Unit pins + e2e green; screenshots under `output/session-139-empty-copy/`.

## Acceptance Criteria

- [ ] Command empty includes recovery next step
- [ ] At least log/audit filtered empty copy mentions recovery
- [ ] `npm run verify` (110) + `npm run test:e2e` (7)
- [ ] Screenshots desktop + 390

## Constraints / non-goals

- No new empty layouts or CTA buttons beyond existing hooks
- No redesign of first-run import empty (already polished)

## Notes

- Skill: ui-ux-pro-max (empty/error recovery clarity)
