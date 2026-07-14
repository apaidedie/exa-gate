# PRD: Trellis Spec Bootstrap Closeout (Phase C)

**Parent:** `07-14-project-full-cleanup`  
**Order:** Second child. Requires Phase A complete.

## Goal

Make `.trellis/spec` an accurate, executable contract for future AI sessions, document the B3 target module tree, and archive `00-bootstrap-guidelines`.

## Confirmed facts

- Spec layers: `backend`, `frontend` (+ `guides`).
- Several guides already Active (directory, database, quality, components, state, type-safety).
- `error-handling.md` and `logging-guidelines.md` already contain real content — verify vs code, do not blank-rewrite.
- Bootstrap task `00-bootstrap-guidelines` still `in_progress` with incomplete checkboxes in its PRD.

## Requirements

1. Audit each Active spec file against current `src/` behavior; fix wrong claims.
2. Fill any remaining empty/To-fill sections with codebase-backed rules (English, per existing index).
3. Update `frontend/directory-structure.md` with the approved B3 target tree from parent design.
4. If B3 will split `state.ts`, update `backend/directory-structure.md` accordingly.
5. Complete bootstrap task checklist with evidence; archive bootstrap when done.
6. No product runtime code changes required; docs-only preferred.

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| C-AC1 | Backend + frontend indexes list accurate statuses |
| C-AC2 | B3 module tree documented in frontend directory-structure before B3 starts |
| C-AC3 | error-handling + logging guidelines match `src/errors.ts` / state logging contracts |
| C-AC4 | `00-bootstrap-guidelines` archived (or explicitly superseded with note if already obsolete) |
| C-AC5 | No placeholder “To fill” left on required bootstrap files without justification in notes |

## Out of Scope

- Implementing B3 splits
- Rewriting guides that are already correct
- Mass archive cleanup of historical polish tasks

## Dependencies

- Phase A complete (clean workspace baseline).
