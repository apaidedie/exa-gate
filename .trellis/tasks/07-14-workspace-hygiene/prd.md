# PRD: Workspace Hygiene (Phase A)

**Parent:** `07-14-project-full-cleanup`  
**Order:** First child (S1). Blocks C and B3.

## Goal

Leave the git working tree with only intentional, reviewed changes committed (or cleanly reverted), so later spec and refactor work does not ride on noise.

## Locked policy (W1)

Review every dirty path; classify **keep-commit** | **revert** | **defer-B3** | **session-only**. No blanket stash-all or keep-all.

## Confirmed dirty inventory (at planning time)

| Path | Notes |
|------|--------|
| `.codex/agents/*`, `.codex/config.toml`, `.codex/hooks*` | Deleted (~1200 LOC). Likely intentional Trellis migration. |
| `.github/workflows/codeql.yml` | Modified — inspect diff |
| `scripts/fix-sqlite.bat`, `prepare-deployment.bat`, `publish-docker-hub.bat` | Modified — inspect |
| `src/admin-ui/admin.css` | Modified — must not silent-baseline B3 |
| `.trellis/workspace/apaidedie/journal-4.md` | Session journal — session-only |

Re-run `git status` at start; inventory may change.

## Requirements

1. Inspect full diff for each dirty path before acting.
2. Commit keep items in small focused commits with accurate messages.
3. Revert non-intentional edits.
4. `admin.css`: resolve (commit after review, revert, or explicitly defer-B3 with note) **before** marking this child complete.
5. Do not change proxy/admin product behavior except accidental bugfix if a bat/script fix is proven — prefer no product code in this child.
6. Do not start Phase C until this child’s acceptance criteria pass.

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| A-AC1 | Every path from initial dirty set classified and resolved |
| A-AC2 | No unresolved `admin.css` drift heading into B3 |
| A-AC3 | `npm run verify` passes after final A state |
| A-AC4 | Feature commits do not include journal-only noise |
| A-AC5 | Child notes list keep vs revert decisions with one-line rationale |

## Out of Scope

- Spec writing (Phase C)
- Module splits (Phase B3)
- Deleting archive tasks or qa scripts

## Dependencies

- None. Starts on clean intent from `main` + current worktree.
