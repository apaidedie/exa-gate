# Alert Count and Log/Audit Pager Status A11y

## Goal

Frame `#alertCount`, `#logPager`, and `#auditPager` as status regions with dynamic accessible labels, completing the panel/pager status pattern.

## Problem

These counters update as plain text only. Assistive tech does not get framed names for alert volume or log/audit pager summaries.

## Requirements

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"` on all three.
- Dynamic aria-label prefixes: `告警中心：` / `日志分页：` / `审计分页：`.
- Update labels whenever text is rewritten.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present and updated.
- [x] Verify + e2e green.
