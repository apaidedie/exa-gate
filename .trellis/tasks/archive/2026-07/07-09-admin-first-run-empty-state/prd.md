# Admin first run empty state

## Goal

Improve the Admin Console first-run experience when an operator logs in before any upstream Exa keys exist. Instead of a generic empty table row, the Keys view should provide a polished, actionable empty state that explains the next step and opens the existing bulk import flow.

## Background And Confirmed Facts

- The Admin Console is a CSP-compatible vanilla HTML/CSS/ES module UI in `src/admin-ui/`.
- `renderKeys()` currently renders the same empty table message for both zero keys and filtered zero results.
- The console already has an existing bulk import modal opened by `#bulkImportBtn`; this task should reuse that flow.
- Backend tests already cover `keys: []`; this task is frontend presentation and interaction polish, not an API change.
- Stack detection found no frontend framework, component library, Tailwind, or animation package; this task should remain vanilla HTML/CSS/ES modules.

## UI Brief

- Audience: developers and operators evaluating or self-hosting the proxy for the first time.
- Primary workflow: after login, understand that no Exa keys are configured and open the import flow immediately.
- Product archetype: operational SaaS console, dense but calm.
- Constraints: no new dependencies, preserve existing table structure and import modal ids, keep CSP compatibility.
- Art direction: quiet onboarding inside the existing panel, with concise copy, one primary action, and no marketing-style hero.

## Requirements

- Show a dedicated first-run empty state when `state.keys.length === 0`.
- The empty state must include a primary action that opens the existing bulk import modal.
- Keep filtered/search empty states distinct from first-run empty states.
- Preserve table semantics and existing key table behavior once keys exist.
- Update tests so the first-run empty state and action cannot regress silently.
- Do not add backend routes, new assets, new dependencies, or a broader onboarding system.

## Acceptance Criteria

- [ ] With zero keys, the Keys tab shows an actionable empty state with clear next-step copy.
- [ ] The empty state primary action opens the existing bulk import modal.
- [ ] With keys present but filters matching nothing, the UI still shows a filter/search empty result rather than first-run onboarding.
- [ ] Existing key table, pagination, batch actions, and import modal behavior remain intact.
- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run verify`, and `git diff --check` pass.

## Out Of Scope

- Changing the key import API contract or validation rules.
- Adding a multi-step setup wizard.
- Changing README/demo data or backend seed behavior.

## Open Questions

None. The user delegated implementation decisions, and repository evidence identifies a narrow first-run UX gap.
