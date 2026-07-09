# Polish audit and config governance panel

## Goal

Make the Admin Console audit/config tab read like a production governance surface instead of two plain lists, so self-hosting operators can quickly judge administrative activity, security posture, retention state, and export actions.

## Background

- The key pool, logs, overview, mobile shell, import modal, and README previews have already received multiple polish passes.
- The current audit/config tab is functional but visually flatter than the rest of the console: audit rows show raw action metadata, and config items are a dense list without a clear posture summary.
- Existing data is enough for a better surface: `state.audit`, `state.config`, and observability retention fields already contain login/export/key action history, HTTPS/raw-key/session policy, allowed paths, state backend, affinity, and log retention.
- This work should stay frontend-only and preserve backend API behavior.

## Requirements

- Improve the `审计与配置` tab hierarchy with a compact governance summary above the audit/config details.
- Add audit summary cards derived from the already-loaded audit list: total entries, successful entries, failed entries, and most recent administrative action.
- Add a security posture block derived from the already-loaded config summary: admin HTTPS policy, raw key reveal policy, session TTL, path policy, and log retention status.
- Improve audit row copy/metadata hierarchy without removing the raw action code that helps debugging.
- Keep export audit behavior and `#exportAudit`, `#auditList`, and existing config ids intact.
- Keep the UI static and CSP-safe: no new dependencies, assets, inline scripts, or backend endpoints.
- Keep desktop and 390px mobile layouts free of document-level horizontal overflow.

## Acceptance Criteria

- [x] `index.html` adds governance/audit summary structure in the audit tab while preserving existing ids used by JS/tests.
- [x] `renderLogs.js` renders audit summary metrics and improved empty/list states from `state.audit` without unescaped server-provided text.
- [x] `renderObservability.js` renders governance posture from `state.config` and retention data without changing API contracts.
- [x] `admin.css` adds token-driven governance/audit/config styling with stable responsive layout and no layout-shifting hover states.
- [x] Static tests assert the new governance structure, renderer functions, preserved ids, and no backend dependency changes.
- [x] Playwright covers the audit/config tab after login, including governance summary visibility, audit action labels, config posture text, export audit control, and mobile reachability.
- [x] Rendered QA checks desktop `1440x960` and mobile `390x844` for audit/config fit, no horizontal overflow, and reachable export/config controls.
- [x] `npx vitest run test/admin.test.ts`, `npm run test:e2e`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass.

## Out Of Scope

- New backend audit fields, API endpoints, or persistence changes.
- Editable configuration UI.
- New charts or chart libraries.
- Reworking key pool, logs, import modal, login, or README assets in this task.
