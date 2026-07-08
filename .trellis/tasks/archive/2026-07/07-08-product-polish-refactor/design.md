# Technical design

## Architecture and boundaries

The project stays a single-process Fastify reverse proxy. Backend work is limited to compatibility-preserving quality and security fixes around dependencies, admin routes, tests, and build scripts. The Admin Console stays in `src/admin-ui/` as static HTML, CSS, and ES modules so it continues to work with the strict CSP in `src/admin/static.ts` and the existing asset hashing pipeline.

## UI direction

Use the `ui-ux-pro-max` guidance as a compact art direction: dark technical surface, high contrast text, restrained green/blue status language, precise spacing, visible focus, and motion only for feedback. The visual system should use CSS custom properties as the source of truth. Animations should be short, optional under `prefers-reduced-motion`, and never required to understand state. Copy should be operator-focused and calm, replacing decorative labels with concrete meaning.

## Product behavior

Keep the current proxy routes and admin API contracts. Keep raw key display off by default, session-based admin auth, encrypted key storage, retry/failover, observability, Prometheus metrics, and batch key workflows. Add or refine only features that reduce first-run friction or operational ambiguity without expanding the system into a larger platform.

## Compatibility and migration

Dependency updates must stay within Node 22 support and avoid changing runtime APIs. Static UI assets must continue to be copied by `scripts/copy-admin-ui.mjs` and fingerprinted by `src/admin/static.ts`. Existing databases must keep working with current safe migrations in `src/state.ts`.

## Rollback shape

Dependency update rollback is package manifest and lockfile only. UI rollback is isolated to `src/admin-ui/` and related tests/docs. Backend route rollback is isolated to targeted modules and associated tests.
