# E2E Pin for Key Row Action Focus Restore

## Goal

Playwright-assert that clicking a table-row key action restores keyboard focus to the same row control after async re-render.

## Requirements

- After row `data-action="test"` on `key_01_search`, the recreated test button is focused.
- Unit pins already cover implementation; this pins runtime behavior.
- Verify + e2e green.

## Acceptance Criteria

- [x] E2E asserts focus restore after row test.
- [x] No product regressions.
