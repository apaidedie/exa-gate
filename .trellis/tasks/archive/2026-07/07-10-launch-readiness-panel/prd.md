# Launch Readiness Panel

## Goal

Add a compact launch-readiness surface to the Admin Console so a new operator can move from demo evaluation to production setup with less context switching.

The panel should live in the existing Audit & Config area and turn already-available config, retention, and security signals into a clear deployment checklist plus copy-ready local commands. It should improve perceived product maturity without adding backend APIs, frontend dependencies, or a broader redesign.

## User Value

After opening the console, an operator should be able to answer: is the management surface safe enough, where are the health probes, what token boundary matters, and what command should I run next? Today these facts are spread across README/config cards; the UI should make the production path feel intentional and operational.

## Confirmed Facts

- The Admin Console is a CSP-compatible vanilla HTML/CSS/ES module app under `src/admin-ui/`.
- Audit & Config already renders desensitized runtime config through `renderConfigSummary()` and retention data through `renderRetention()`.
- Existing UI patterns use semantic buttons, tokenized dark surfaces, compact evidence strips, and Playwright hit-target/overflow checks.
- README already documents `/_proxy/live`, `/_proxy/ready`, `/_proxy/health`, `EXA_PROXY_TOKENS`, `EXA_ADMIN_TOKENS`, `EXA_KEYS_ENCRYPTION_SECRET`, `EXA_ADMIN_REQUIRE_HTTPS`, and demo usage.

## Requirements

- Add a production readiness panel to the Audit & Config tab using existing config and retention state only.
- Show at least four readiness checks: HTTPS management posture, raw key display policy, state persistence, and log retention.
- Include compact copy-ready commands for live/readiness/health probes and a sample proxy request, with no inline event handlers and no new dependencies.
- Provide a semantic copy action for each command; successful copy should use the existing toast pattern and failure should surface a concise bad toast.
- Keep copy and labels concise, operational, and Chinese-first.
- Preserve the existing Audit & Config layout, mobile reachability, focus visibility, and document-level no-horizontal-overflow behavior.
- Do not add or change backend APIs, config fields, routing, auth, external fonts, icon libraries, or a frontend framework.

## Acceptance Criteria

- [ ] Static/source tests confirm the readiness panel DOM, readiness command contracts, copy handler, and CSS hooks exist.
- [ ] E2E verifies the Audit & Config tab shows readiness checks, command cards, and copy actions.
- [ ] E2E verifies copying a readiness command writes text to the clipboard or shows the fallback failure toast without breaking the page.
- [ ] E2E verifies desktop and mobile readiness controls are reachable, unclipped, uncovered, and do not create document-level horizontal overflow.
- [ ] `git diff --check`, targeted Admin tests, Admin Console E2E, and `npm run verify` pass.

## Out of Scope

- Backend readiness API changes.
- Persisted deployment profiles or editable environment configuration.
- Full Audit & Config redesign.
- Replacing README deployment documentation.
