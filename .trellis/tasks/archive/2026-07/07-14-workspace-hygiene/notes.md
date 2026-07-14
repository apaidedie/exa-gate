# Phase A decisions

| Path | Class | Rationale |
|------|-------|-----------|
| `.codex/**` (deleted) | **keep-commit** | Files absent on disk; session is OpenCode + Trellis (`.agents/skills`). Codex platform templates remain regenerable via `trellis update` if needed. |
| `.github/workflows/codeql.yml` | **noop** | Content hash == HEAD; false dirty from index/stat. Refreshed with `git add`. |
| `scripts/*.bat` (3 files) | **noop** | Same as above. |
| `src/admin-ui/admin.css` | **noop** | Same as above — no CSS drift into B3. |
| `.trellis/workspace/apaidedie/journal-4.md` | **noop** | Same content as HEAD; not committed as feature. |
| `.trellis/tasks/07-14-*` planning trees | **keep-commit** | Parent + children PRD/design/implement for full cleanup program. |

## Commits planned

1. `chore: remove unused .codex project integration`
2. `chore(task): plan project full cleanup A-C-B3`
