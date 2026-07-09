# Polish audit evidence legibility

## Goal

Improve the readability of the Admin Console `审计与配置` evidence strips so audit and config posture hints remain legible on desktop narrow columns and mobile, without changing backend data, API contracts, or the existing static UI architecture.

## Background

- Rendered UI audit found clipping in the audit/config evidence strips, especially `#auditEvidenceAction`, `#configEvidenceHttpsHint`, and `#configEvidenceRawKeyHint`.
- The Admin Console is a CSP-compatible static HTML/CSS/ES module UI in `src/admin-ui/`.
- UI direction remains an operational SaaS/data-product console: dense, calm, dark, token-driven, and focused on scan clarity rather than decorative layout.
- Existing evidence ids are covered by tests and must remain stable.

## Requirements

- Keep the task limited to the `审计与配置` tab evidence strips and adjacent copy/layout needed to prevent clipping.
- Preserve existing DOM ids, tab labels, API calls, state fields, and data derivation behavior.
- Use existing CSS custom properties and the current dark technical design system; do not add dependencies, fonts, frameworks, CDN assets, or inline production styles.
- Allow long audit/config hint text to wrap or compact cleanly across desktop and mobile without causing document-level horizontal overflow.
- Keep the first audit/config evidence and table/list content reachable in the first useful viewport on mobile.
- Keep Chinese operator copy concise and status-oriented.

## Acceptance Criteria

- [x] `#auditEvidenceAction`, `#configEvidenceHttpsHint`, and `#configEvidenceRawKeyHint` do not clip in rendered desktop and mobile QA.
- [x] `#auditEvidence` and `#configEvidence` have no empty cells, retain stable responsive dimensions, and keep semantic good/warn/bad text states.
- [x] The page has no document-level horizontal overflow at desktop and mobile viewport sizes.
- [x] Existing Admin Console E2E assertions for audit/config still pass.
- [x] A task-local rendered QA script verifies the affected evidence text, overflow, and visible audit/config regions.
- [x] `npm run verify` passes before archiving.

## Out Of Scope

- Backend/admin API changes.
- New config or audit data fields.
- New frontend runtime dependencies, component libraries, routing, or external assets.
- Redesigning unrelated tabs or changing key/log workflows.
