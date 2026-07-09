# Polish key toolbar workflow

## Goal

Improve the Admin Console key-pool toolbar so operators can quickly understand current filter scope, selected keys, visible problem pressure, and the safest next action without scanning the whole table. This should make the primary post-login workflow feel more deliberate and GitHub-demo-ready.

## Background

- The long-running objective prioritizes frontend UI/UX polish, concise copy, elegant motion, and a product quality bar suitable for a high-star open-source project.
- The key pool is the default active tab and main operator workflow.
- Existing key UI already includes search, status chips, batch test, disable problems, bulk import, table pagination, first-run import, details, and batch selection bar.
- The toolbar currently exposes controls but does not summarize active scope or guide the operator after search/filter/selection changes.

## Requirements

- Preserve existing key API behavior, DOM ids, table columns, sort behavior, pagination behavior, and batch action contracts.
- Add a compact key workflow summary near the key table controls that communicates visible count, selected count, problem count, and current filter/search scope.
- Keep summary copy concise, operational, and derived from existing client state only.
- Improve mobile usability without horizontal document overflow or clipped controls.
- Do not add new dependencies, frameworks, external icons, fonts, backend fields, or API routes.
- Keep the dark operational SaaS/data-product art direction and stable control dimensions.
- Ensure search/filter/pagination/selection re-renders keep the summary in sync.

## Acceptance Criteria

- [x] Key tab renders a workflow summary section with visible, selected, problem, and scope values.
- [x] Summary updates when search text, status chips, page size, page navigation, or checkbox selection changes.
- [x] Empty filtered states remain clear and do not conflict with first-run import onboarding.
- [x] Existing key actions, batch bar, import modal, details panel, and pagination continue to work.
- [x] Desktop and mobile rendered QA confirm no document-level horizontal overflow and no toolbar/summary overlap.
- [x] Static and e2e tests cover the new summary signatures and at least one dynamic update path.
- [x] Full project verification passes before commit.

## Out Of Scope

- Backend key API changes.
- New persistent filter state.
- Replacing the key table or adding virtualized rendering.
- New charting or icon libraries.
