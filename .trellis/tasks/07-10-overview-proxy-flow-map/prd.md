# Overview Proxy Flow Map

## Goal

Make the Admin Console Overview tab explain the core proxy request path at a glance: client token, proxy entry, key pool, and Exa upstream. The UI should feel like an operational SaaS control surface: compact, data-driven, calm, and useful during a demo or first run.

## Background

- The Admin Console is a CSP-compatible static HTML/CSS/ES module UI under `src/admin-ui/`.
- The Overview tab already exposes summary signals, insight cards, metrics, ops cards, and trends.
- Existing Overview actions use delegated `data-overview-action` and `data-overview-signal-action` buttons handled by `admin.js`.
- Available runtime state already includes keys, logs, config, and observability; this task must not require backend API changes.
- The product direction is a polished dark technical admin tool, not a marketing landing page.

## Requirements

- Add a compact proxy flow map to the Overview tab near the top of the screen.
- Show four actionable stages: client token, proxy entry, key pool, and Exa upstream.
- Derive stage values and hints from existing `state.keys`, `state.logs`, `state.config`, and available observability/config state when useful.
- Reuse existing overview action routing where possible so flow nodes can jump to the relevant operational view.
- Keep all dynamic server-provided text escaped or assigned via `textContent`.
- Use semantic buttons, ARIA labels, visible focus states, and touch targets that stay usable on mobile.
- Keep the visual design token-driven in `admin.css`, with responsive constraints and no decorative blobs, external assets, frameworks, inline handlers, or backend contract changes.

## Acceptance Criteria

- [x] Overview includes a visible `#proxyFlowMap` section with the four flow stages and concise Chinese-first operator copy.
- [x] Flow stage values update from existing state after refresh and handle empty/no-log states gracefully.
- [x] Clicking flow stages routes to relevant console areas using the existing delegated overview action pattern.
- [x] Desktop and mobile layouts have no page-level horizontal overflow, no clipped stage copy, and stable button dimensions.
- [x] Static and E2E tests cover the new DOM hooks, CSS hooks, rendered content, and reachable flow-stage controls.
- [x] `git diff --check`, targeted unit/static tests, targeted E2E tests, and `npm run verify` pass before the task is archived.

## Out Of Scope

- New backend endpoints or changes to admin API contracts.
- New frontend framework, router, icon package, CDN asset, or external font.
- Replacing the existing Overview metrics, insight cards, launch readiness, or logs/key flows.
