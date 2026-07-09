# Design

## Boundaries

- Modify only the static Admin Console audit/config surface and tests:
  - `src/admin-ui/index.html`
  - `src/admin-ui/admin.css`
  - `src/admin-ui/renderLogs.js`
  - `src/admin-ui/renderObservability.js`
  - `test/admin.test.ts`
  - `test/e2e/admin-console.spec.ts`
- Preserve backend admin routes and fetch contracts.
- Preserve existing ids: `#auditList`, `#exportAudit`, all `config*`, `retention*`, and tab/navigation ids.

## UI Brief

- Audience: operators running a self-hosted Exa proxy who need confidence that admin actions, key secrecy, HTTPS posture, and log retention are under control.
- Primary workflow: open `审计与配置`, confirm governance posture, scan recent admin actions, export evidence when needed.
- Product archetype: operational SaaS/data product with security/governance emphasis.
- Constraints: vanilla HTML/CSS/ES modules, strict CSP, Chinese UI copy, dark technical art direction, no new assets or dependencies.
- States: no audit records, successful/failed audit records, HTTPS required/not required, raw-key allowed/denied, retention enabled/disabled, mobile.
- Acceptance: static tests, Playwright audit flow, desktop/mobile rendered QA, full verification suite.

## Structure

- Add a `governance-strip` before the existing `management-grid` in the audit tab:
  - Audit summary card with `#auditTotal`, `#auditSuccess`, `#auditFailure`, `#auditLatest`.
  - Security posture card with `#governanceHttps`, `#governanceRawKey`, `#governanceSession`, `#governancePathPolicy`.
  - Retention card with `#governanceRetention`, `#governanceExpired`, and existing retention data mirrored from observability.
- Keep `management-grid` as the detailed section below the summary strip.
- Improve audit rows by preserving `audit-action-code` while adding clearer row classes and labels.

## Behavior

- `renderAudit()` computes summary from `state.audit` and updates the new ids before rendering rows.
- `renderConfigSummary()` updates governance posture fields from `state.config`.
- `renderRetention()` updates governance retention fields from `state.observability.retention`.
- No new event handlers are required; `#exportAudit` behavior remains unchanged.

## Responsive Design

- Desktop: three governance cards in a top row above the audit/config grid.
- Tablet/mobile: cards stack into one column; audit/config detailed panels remain vertically scrollable.
- Use existing tokens and 36px target guidance for action controls; avoid dimension-changing hover/focus states.

## Compatibility And Rollback

- No backend/API/data migration.
- Rollback can remove the new summary markup/styles and summary renderer updates while retaining the existing audit list and config body.
