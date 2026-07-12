# Audit Count and Key Pager Status A11y

## Goal

Frame `#auditCount`, `#keyPager`, and `#keyPageLabel` as status regions with dynamic accessible labels, matching keyCount/logCount.

## Problem

These head/pager counters update as plain text only. Assistive tech does not get a framed name for audit window size or key pagination range.

## Requirements

- `role="status"`, `aria-live="polite"`, `aria-atomic="true"` on all three.
- Dynamic `aria-label` prefixes: `管理员审计：` / `密钥分页：` / `密钥页码：`.
- Update labels whenever text is rewritten (including filtered audit window copy).
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Status attributes present and updated for audit count and key pager.
- [x] Verify + e2e green.
