# Logs Filter Apply Refresh Label

## Goal

Rename `#applyLogFilters` from misleading `筛选` to honest refresh copy, because path/key/status already auto-reload and keyword search is live.

## Requirements

- Button label: `刷新列表` (or similar).
- aria-label: re-load current filter window.
- pending text stays coherent (`载入中` / `刷新中`).
- Update unit pins; e2e uses id so should be fine.
- Archive abandoned live-filter task folder if still present.

## Acceptance Criteria

- [x] Label no longer implies manual-only filtering.
- [ ] Verify green.
