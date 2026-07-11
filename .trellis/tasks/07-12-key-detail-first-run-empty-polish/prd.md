# Key Detail First-Run Empty State Polish

## Goal

Align the Key Pool detail pane (desktop sticky + mobile) with the structured first-run empty state already used in the keys table, so zero-key onboarding is consistent and actionable in both places.

## Background And Confirmed Facts

- Table first-run empty state is polished (`.first-run-empty` + `data-empty-action="import"`).
- Filtered detail empty is structured (`.key-detail-empty.filtered` + clear-filters).
- Zero-key detail still uses plain `.empty` copy: `导入密钥后，这里会显示选中密钥的用量、冷却和最后错误。`
- Static shells in `index.html` for `#detailsBody` and `#mobileDetailsBody` still use plain select-key copy.
- `runKeyEmptyAction('import')` already opens the import modal from detail-body delegated clicks.

## Requirements

- R1: When `state.keys.length === 0`, detail panes render a structured first-run empty state (kicker/title/body + import CTA).
- R2: Primary action reuses `data-empty-action="import"` and existing open-import path.
- R3: Filtered detail empty remains distinct (clear-filters, not import).
- R4: Static HTML placeholders for detail panes use the same structured idle/first-run language so first paint is not a plain sentence.
- R5: Update static + E2E coverage for zero-key detail empty and import CTA.

## Acceptance Criteria

- [x] Zero keys: desktop and mobile detail bodies show structured first-run empty with import action.
- [x] Import CTA opens existing bulk import modal.
- [x] Filtered empty detail still offers clear-filters, not import.
- [x] Static detail placeholders are structured (not a single plain sentence).
- [x] Desktop + 390px visual checks show no document-level horizontal overflow.
- [x] Focused tests, E2E first-run path, and `npm run verify` pass.

## Out Of Scope

- Logs/Audit filtered empty CTAs (follow-up).
- Refresh-failure in-panel recovery (follow-up).
- Backend or import API changes.
