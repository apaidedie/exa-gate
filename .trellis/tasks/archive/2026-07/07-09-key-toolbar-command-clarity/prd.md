# Polish key toolbar command clarity

## Goal

Make the Admin Console key pool toolbar describe batch commands accurately, so operators can distinguish page-level commands from selected-key commands without reading implementation details.

## Confirmed Facts

- The Admin Console is a static HTML/CSS/ES module UI served from `src/admin-ui/` and must remain CSP-compatible.
- The key pool toolbar button `#batchTestPage` is labeled `测试选中`, but its click handler calls `batchKeyAction('test', state.pageKeyIds)`, so it tests keys on the current page rather than selected checkbox rows.
- The true selected-key batch commands live in the bottom `#batchBar`, which appears after checkbox selection and acts on `state.selectedKeyIds`.
- `#batchDisableProblems` acts on `state.problemKeyIds`, so its label should make the target set clear without adding visual clutter.

## Requirements

- Keep the existing batch action behavior and DOM ids stable.
- Rename or clarify top key toolbar commands so their visible copy matches their target sets.
- Preserve the bottom selected-key batch bar as the only selected-row batch action surface.
- Keep the change compact enough for desktop and mobile toolbar layouts, with no horizontal overflow.
- Do not add a frontend framework, external assets, CDN fonts, inline scripts, or inline styles.

## Acceptance Criteria

- [x] The top key toolbar no longer says `测试选中`.
- [x] The top test command communicates that it tests the current page's keys.
- [x] The problem-key disable command communicates that it targets abnormal/problem keys.
- [x] The selected-key batch bar still says `已选 N 个密钥` and remains hidden until rows are selected.
- [x] Static UI tests cover the corrected copy and absence of the misleading copy.
- [x] E2E coverage confirms the current-page toolbar command exists and the selected-key batch bar appears only after checkbox selection.
- [x] Rendered desktop and mobile checks show no toolbar text overlap or horizontal page overflow.

## Out Of Scope

- Changing batch key API behavior.
- Replacing the key table or batch selection model.
- Introducing new dependencies or a component framework.
