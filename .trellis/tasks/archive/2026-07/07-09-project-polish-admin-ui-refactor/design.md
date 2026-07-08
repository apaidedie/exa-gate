# Design

## Architecture And Boundaries

The work stays inside the existing static Admin Console architecture:

- `src/admin-ui/index.html` remains the structural shell and selector contract.
- `src/admin-ui/admin.css` remains the token, layout, responsive, state, and motion source of truth.
- `src/admin-ui/admin.js` remains event wiring, refresh orchestration, tab switching, async action state, and local persistence.
- `src/admin-ui/renderKeys.js`, `renderLogs.js`, and `renderObservability.js` remain render ownership boundaries.
- `src/admin/static.ts` and `scripts/copy-admin-ui.mjs` must only change if a new asset is introduced. The current plan does not need new assets.

No frontend framework, component library, external font, CDN, inline event handler, or image asset will be introduced. The strict Admin CSP remains compatible.

## Visual System

The UI will use a single dark technical token system:

- Background: deep neutral with low-saturation green/blue light accents used sparingly for hierarchy.
- Surfaces: flat-to-soft elevated panels with 8px-or-less radii for app surfaces.
- Status language: green for healthy/success, amber for attention/retry/cooldown, red for destructive/failure, blue for neutral action/data emphasis.
- Typography: system UI stack only, compact scale, no viewport-sized text, no negative letter spacing.
- Motion: short transitions for hover, focus, selection, toasts, modal entry, and tab content. Reduced motion collapses transitions.
- Density: operational, not marketing. Cards are reserved for repeated information units and framed tools, with no nested decorative card structure.

## Interaction Design

- Login explains the difference between admin tokens and Exa API keys with concise operator copy.
- Topbar actions should wrap without overlapping and keep touch targets usable.
- Sidebar remains optional on narrow viewports and collapsible on desktop.
- Key table remains the primary workspace, with stable row height, selected row state, clear status badges, sortable headers, batch selection, and internal horizontal scroll when needed.
- Detail panel should feel like an inspection drawer, not a disconnected card. It should expose status, KPIs, cooldown, failure reasons, and actions with clear hierarchy.
- Logs should keep request-id trace discovery obvious and avoid full-page horizontal overflow.
- Observability should prefer compact visible values, bullet/progress style bars, and textual alert labels over chart-only meaning.
- Modal and toast interactions should communicate pending, success, and error states without layout shift.

## Data Flow And Contracts

Data flow remains unchanged:

1. `admin.js` calls fetch helpers in `api.js`.
2. Responses populate the shared `state` object.
3. Render modules escape server-provided strings through `esc()` and write HTML for their owned panels.
4. User actions call admin endpoints, show toast/status feedback, and refresh state.

Selectors used by E2E tests must remain stable, especially `#loginButton`, `#keysBody`, `#detailsBody`, `#logStatusFilter`, `#exportLogs`, `#testWebhook`, tab role names, and key action attributes.

## Compatibility And Rollback

- CSS-only visual changes can be rolled back by reverting `src/admin-ui/admin.css`.
- Copy and structure changes in `index.html` must preserve asset injection patterns for `admin.css`, `admin.js`, and `#assetVersion`.
- JavaScript interaction changes must remain small and test-backed because they can affect E2E workflows.
- Build output under `dist/` should not be hand-edited.

## Tradeoffs

- Keeping vanilla UI limits component abstraction, but it preserves low bundle size, CSP simplicity, and the project's self-hosted deployment story.
- The project is an operations tool, so a quiet and precise interface is more valuable than a dramatic landing-page aesthetic.
- Tables may retain internal horizontal scrolling on small screens because the data is dense; the shell itself must not overflow.
