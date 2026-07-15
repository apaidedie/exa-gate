# Design: Project Full Cleanup

## Architecture Intent

Preserve the existing runtime architecture (single Fastify process, SQLite state, static Admin Console). This program only improves **workspace hygiene**, **AI-facing specs**, and **source module boundaries**.

```text
Phase A: git/workspace hygiene
    ↓
Phase C: .trellis/spec truth + B3 tree contract
    ↓
Phase B3: leaf-first source splits (R1 behavior freeze)
```

## Boundaries

| Layer | May change | Must not change |
|-------|------------|-----------------|
| Git / tooling | Untracked/deleted intent, scripts, CI config if intentional | Product behavior |
| Spec | `.trellis/spec/**` accuracy and B3 layout docs | Invent fake conventions |
| Admin UI JS | File layout, import graph, internal function location | DOM ids, `data-*`, visible strings, network contracts |
| Admin UI CSS | File split / import order if supported | Computed visual result |
| Backend state | Internal modules under `createStateStore` | Public `StateStore` method semantics |
| Proxy / auth / admin API | None (unless forced by import path fix) | Routes, status codes, JSON error shape |

## Phase A Design

### Dirty path policy (W1)

For each path in `git status`:

1. `git diff` / content inspection
2. Label: **keep-commit** | **revert** | **defer-B3** | **session-only**
3. Commit keep items in focused commits (e.g. `chore: remove unused .codex integration`)
4. Revert noise before Phase C/B3

### Default expectations (confirm with diff)

- `.codex/**` deleted → likely keep if Trellis is source of truth
- `src/admin-ui/admin.css` → must not be silent baseline drift into B3
- `scripts/*.bat`, `.github/workflows/codeql.yml` → keep only if correct
- `.trellis/workspace/**/journal-*.md` → session-only; not mixed into code commits

## Phase C Design

### Spec packages

- Backend: directory, database, quality, error-handling, logging — verify against `src/errors.ts`, `src/state.ts`, `src/proxy.ts`, `src/admin.ts`
- Frontend: directory, components, state, type-safety, quality — verify against `src/admin-ui/*`, `src/admin/static.ts`, `scripts/copy-admin-ui.mjs`
- Update **frontend directory-structure** with B3 target tree before B3 starts
- If state domain split planned, document under backend directory-structure

### Bootstrap closeout

- Complete `00-bootstrap-guidelines` checklist with real evidence
- Archive via Trellis when criteria met

## Phase B3 Design (T1 + R1)

### Target frontend module tree

```text
src/admin-ui/
├── index.html                 # structure contract unchanged
├── admin.css                  # entry or concatenated modules (pipeline-safe)
├── admin.js                   # thin boot + event wiring only
├── api.js                     # existing
├── state.js                   # existing shared mutable state
├── renderKeys.js              # existing (optional later split if still huge)
├── renderLogs.js
├── renderObservability.js
├── ui/
│   ├── toast.js
│   ├── busy.js
│   ├── focus.js
│   └── confirm-action.js
├── session/
│   └── auth-ui.js
├── live/
│   ├── refresh.js
│   └── events.js
├── command/
│   └── palette.js
├── keys/
│   └── actions.js
├── logs/
│   └── actions.js
├── audit/
│   └── actions.js
└── nav/
    └── tabs.js
```

### Extraction order (T1)

1. **Leaf pure helpers**: toast, busy/pending buttons, focus scheduling, confirm-action trap
2. **Session / live**: login UI, session expiry, SSE, refresh status/recovery
3. **Command palette**
4. **Domain actions**: keys, logs, audit filters/actions
5. **Nav/tabs** orchestration helpers
6. **admin.js** left as imports + `bind` + boot

Each package: move functions → wire exports → run tests → commit.

### CSS modularization

Preferred (R1-safe):

- Split source into logical files **or** clearly delimited sections with stable selectors
- Prefer approach that does **not** require a bundler
- If multiple CSS files are served: update `src/admin/static.ts` `assetPaths` and `scripts/copy-admin-ui.mjs` together; update `index.html` link tags
- If multi-file CSS is too risky for CSP/static: keep single `admin.css` file but reorganize with section banners and optional later extract — document choice in child notes

Default plan: **multi-file CSS only if static pipeline + e2e remain green with minimal HTML link changes**; otherwise sectioned single file.

### Backend `state.ts` (optional but in scope if low risk)

```text
src/state.ts                 # createStateStore facade + types re-export
src/state/
  keys.ts
  logs.ts
  audit.ts
  sessions.ts
  migrations.ts              # schema init if cleanly separable
```

Public import path for app code remains `./state.js` (`createStateStore`, types).

### Shared-state rule

Extracted modules must not invent parallel globals. Use:

- existing `state.js` browser state object, or
- explicit parameters / small facades passed from `admin.js`

### Compatibility

- Playwright and `qa-*.mts` selectors remain valid
- Prometheus, OpenAPI, admin JSON unchanged
- Encryption, key scheduler, proxy retry loop untouched

## Trade-offs

| Choice | Benefit | Cost |
|--------|---------|------|
| T1 leaf-first | Bisectable, R1-safe | More commits / longer calendar |
| Defer renderKeys mega-split | Lower e2e risk | File may stay large until follow-up |
| CSS multi-file optional | Avoid static/CSP footguns | May leave one large CSS file |
| Spec before B3 | Split matches documented tree | Phase C blocks coding |

## Rollback

- Phase A: revert individual hygiene commits
- Phase C: docs-only; trivial revert
- Phase B3: revert last extraction commit; avoid rewriting history on shared branches

## Ops / Verification

| Gate | Command |
|------|---------|
| Default | `npm run verify` |
| Admin UI / static / auth | `npm run test:e2e` |
| Optional visual | `npm run demo:ui` smoke |

No production migration. Deploy artifact is still `npm run build` + Docker as today.
