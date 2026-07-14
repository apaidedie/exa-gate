# PRD: Project Full Cleanup (A → C → B3)

## Goal

Bring the Exa Reverse Proxy repo to a maintainable baseline: clean workspace intent, complete Trellis coding specs, and aggressive module splits for oversized Admin UI / state code — without changing product behavior.

## Background

- Repo is a Node 22 / Fastify / SQLite reverse proxy with a static Admin Console (`src/admin-ui/`).
- Recent history is dominated by fine-grained Admin UI a11y polish (hundreds of archived tasks).
- Working tree currently has uncommitted deletes under `.codex/` and other local edits.
- Hotspots: `admin.js` (~2306 LOC), `admin.css` (~2110 LOC), `renderKeys.js` (~977 LOC), `state.ts` (~691 LOC).
- Active leftover task: `00-bootstrap-guidelines` (spec largely filled; needs closeout).

## Locked Decisions

| ID | Decision |
|----|----------|
| D | Full package: hygiene (A) + Trellis/spec (C) + code structure (B) |
| B3 | Aggressive module split for large files |
| R1 | Pure refactor: freeze DOM ids, `data-*`, copy, visuals, API contracts |
| S1 | Order: **A → C → B3** |
| W1 | Review dirty workspace item-by-item (not blanket stash/keep) |
| P1 | Parent task + three independently verifiable children |
| T1 | B3 extraction strategy: leaf-first helpers, then domain modules, thin orchestrator |

## Task Map

| Child | Slug dir | Phase | Role |
|-------|----------|-------|------|
| Workspace hygiene | `07-14-workspace-hygiene` | A | Clean intentional commits; no behavior change |
| Trellis spec closeout | `07-14-trellis-spec-closeout` | C | Finish/align `.trellis/spec`; archive bootstrap |
| Admin UI module split | `07-14-admin-ui-module-split` | B3 | Leaf-first split under R1; optional `state.ts` domain split |

Parent owns cross-child acceptance and final integration review. Implementation lands in children, not the parent, unless integration-only fixes are required.

## Requirements

### R1 — Phase A (hygiene)
1. Review every dirty path; classify keep / revert / defer-to-B3.
2. `.codex/` removal: commit only if project intentionally left Codex hooks for Trellis/OpenCode.
3. `admin.css` local edits must not enter B3 as unreviewed baseline — either commit after review, revert, or fold into B3 first commit with explicit note.
4. Scripts (`.bat`) and `codeql.yml`: keep only if intentional and correct.
5. Journal updates stay out of feature commits.

### R2 — Phase C (spec)
1. Audit `.trellis/spec/backend` and `frontend` against code; fill gaps; remove stale claims.
2. Document B3 target module tree in frontend directory-structure (and backend if state splits).
3. Close `00-bootstrap-guidelines` with evidence and archive when complete.

### R3 — Phase B3 (structure, R1)
1. Split `admin.js` via T1 into UI helpers + domain modules; leave thin orchestrator.
2. Modularize `admin.css` without visual change; keep static serve / copy pipeline valid.
3. Optionally split `state.ts` by domain behind stable `createStateStore` facade.
4. Do not change OpenAPI semantics, auth rules, retry/proxy behavior, or user-visible copy.
5. Atomic commits per extraction package; full gate at phase end.

### R4 — Cross-cutting
1. Each child ends with its gate green before the next child starts.
2. Final parent gate: all children archived or completed; `npm run verify` + `npm run test:e2e` green on integration tip.

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC1 | Phase A child completed: intentional hygiene commits only; no accidental product diffs |
| AC2 | Phase C child completed: specs current; bootstrap archived; B3 tree documented |
| AC3 | Phase B3 child completed: module tree matches design; R1 freeze held |
| AC4 | `npm run verify` passes after A, after C (if code untouched may skip e2e), after B3 |
| AC5 | `npm run test:e2e` passes at end of B3 and at parent integration close |
| AC6 | `admin.js` substantially thinner (target &lt; ~600 LOC orchestrator); CSS modularized; state facade stable if split |
| AC7 | No intentional changes to DOM contracts, API JSON shapes, or proxy retry/auth semantics |

## Out of Scope

- Product UX redesign, copy rewrites, new features
- Framework migration (React, bundlers) unless static pipeline forces a minimal change (default: no)
- Mass-delete of `qa-*.mts` or archive task history
- Rewriting proxy/scheduler algorithms

## Open Questions

None blocking. Execution may discover `.codex` / CSS keep-or-revert during Phase A review; resolve with evidence in that child’s notes, not by expanding product scope.
