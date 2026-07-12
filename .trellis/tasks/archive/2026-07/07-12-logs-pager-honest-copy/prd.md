# Logs Pager Honest Copy

## Goal

Replace the static misleading logs footer label `每页 10 条` with honest copy that matches actual load/filter behavior (recent window of loaded rows, not a 10-row pager).

## Requirements

- Remove or rewrite the static `每页 10 条` span.
- Keep `#logPager` dynamic summary accurate.
- Optional: note that export uses the current filter window.
- Unit pin; verify green.

## Acceptance Criteria

- [x] Static false pagination claim removed.
- [ ] Honest footer copy present.
- [ ] Verify green.
