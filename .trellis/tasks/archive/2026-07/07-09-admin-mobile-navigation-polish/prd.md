# Admin mobile navigation polish

## Goal

Make the Admin Console's primary navigation usable and polished on tablet and mobile widths. The current desktop sidebar is hidden below 1280px, which leaves authenticated narrow-screen users without a visible way to reach Overview, Request Logs, or Audit/Config. The fix should preserve the dense operations-console personality while adding a compact responsive navigation pattern.

## Background And Confirmed Facts

- The Admin Console is a CSP-compatible vanilla HTML/CSS/ES module UI in `src/admin-ui/`.
- Desktop navigation lives in `.sidebar` with `role="tablist"` and tab buttons using `data-tab` hooks.
- `admin.css` hides `.sidebar` at `max-width: 1279px`, but there is no alternate navigation rendered in the topbar or main content.
- The console already has established dark tokens, compact controls, focus states, and Playwright coverage for login, key actions, logs export, and webhook testing.
- Stack detection found no frontend framework, component library, Tailwind, or animation package; this task should remain vanilla HTML/CSS/ES modules.

## UI Brief

- Audience: operators and developers managing Exa API keys from desktops, tablets, or a phone during incident triage.
- Primary workflow: after login, users must be able to switch between Keys, Overview, Logs, and Audit/Config at every supported viewport.
- Product archetype: operational SaaS console, dense but calm, not a marketing page.
- Constraints: no new UI framework, no external fonts/assets/CDNs, preserve existing DOM ids and data hooks, keep CSP compatibility.
- Art direction: compact dark operations console with restrained emerald/blue status accents, visible focus, stable touch targets, and no ornamental layout shift.

## Requirements

- Add a responsive navigation surface for widths where the desktop sidebar is hidden.
- Reuse the existing tab model and `data-tab` targets so navigation state stays single-source.
- Keep controls readable and reachable on narrow mobile widths without horizontal page overflow.
- Preserve desktop sidebar behavior, including collapse state, for wide viewports.
- Update automated coverage so the mobile navigation path cannot regress silently.
- Do not add dependencies, external assets, routing libraries, or broad visual rewrites.

## Acceptance Criteria

- [ ] At mobile/tablet widths, authenticated users can visibly switch to Overview, Keys, Request Logs, and Audit/Config.
- [ ] The responsive navigation reflects the active tab with `aria-selected` and visual selected state.
- [ ] The responsive navigation has accessible names, keyboard focus styling, and touch-sized controls.
- [ ] Desktop sidebar behavior remains unchanged at wide viewports.
- [ ] Playwright or unit coverage verifies mobile tab navigation reaches Request Logs and Audit/Config.
- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, and `git diff --check` pass.

## Out Of Scope

- Rebuilding the full Admin Console layout again.
- Adding a router, drawer framework, icon package, CSS reset, external font, or Tailwind/shadcn stack.
- Changing backend routes, API contracts, or authentication behavior.

## Open Questions

None. The user delegated implementation decisions, and repository evidence identifies the missing responsive navigation path.
