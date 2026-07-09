# Key Detail Log Drilldown

## Goal
Make the key detail panel a stronger operational decision surface by adding a direct drill-down from the selected key to its filtered request logs.

## User Value
When an operator sees failures, cooldown, 429s, or a suspicious key in the detail panel, they should be able to jump directly to that key's request logs without manually switching tabs and typing the key id. This shortens diagnosis and makes the Admin Console feel more complete and polished.

## Confirmed Facts
- The Admin UI is a vanilla static HTML/CSS/ES module console in `src/admin-ui/`.
- Key details are rendered in `renderKeys.js` and delegated through `button[data-detail-action]` in `admin.js`.
- Request logs already support a `#logKeyFilter` field, `reloadLogs()`, filter summary chips, and focus/navigation behavior.
- Existing slices use semantic buttons, stable `data-*` hooks, visible focus states, no new dependencies, and Playwright hit-target checks.

## Requirements
- Add a semantic detail action button for viewing the selected key's request logs.
- The action must reuse existing log filtering: switch to Request Logs, set `#logKeyFilter` to the selected key id, reload logs, and focus/select the key filter input.
- The action must preserve existing detail actions: test, copy, reset, enable/disable.
- The detail action layout must stay stable on desktop and mobile, with no clipped text, covered controls, or document-level horizontal overflow.
- Copy must remain concise and operational in Chinese.
- Do not add frontend dependencies, routers, fonts, icon libraries, or backend mutation.

## Acceptance Criteria
- Static/source tests confirm the new `data-detail-action="logs"` contract and handler path are present.
- E2E verifies clicking the detail action filters Request Logs by selected key, focuses `#logKeyFilter`, and updates the log filter summary.
- E2E verifies desktop and mobile detail action hit targets remain large enough, unclipped, and uncovered.
- `git diff --check`, targeted admin tests, Admin Console e2e, and `npm run verify` pass.

## Out of Scope
- New log APIs or backend query semantics.
- New detail drawer architecture.
- Broad redesign of the key detail panel beyond the new drill-down action and layout support.
