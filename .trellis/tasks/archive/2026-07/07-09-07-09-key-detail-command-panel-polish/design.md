# Design

## UI Brief

- Audience: operators running a self-hosted Exa reverse proxy who need fast diagnosis under mild operational pressure.
- Primary workflow: select a key, understand whether it is safe to keep routing traffic through it, then test/reset/disable/copy with clear feedback.
- Product archetype: operational SaaS and data product.
- Constraints: static Admin UI, no new dependencies, dark token system, CSP-safe assets, existing IDs and event delegation must remain compatible.
- Source of truth: existing `src/admin-ui/` tokens and structure, Trellis frontend specs, current E2E flows, and UI design-suite guidance for hierarchy, accessibility, motion, and rendered QA.
- States: healthy, cooldown, disabled, failures present, no failures, pending operation, completed operation, selected batch, mobile details open, reduced motion.
- Acceptance: source tests plus rendered browser QA on desktop and mobile.

## Boundaries

- Change only static Admin UI files and tests unless verification exposes a necessary adjacent fix.
- Keep `#detailsBody`, `#mobileDetailsBody`, `.detail-body-target`, `#batchBar`, `#batchCount`, and existing `data-detail-action` buttons.
- Continue mirroring one generated detail markup string to desktop and mobile targets.
- Batch actions continue to call the existing `/ _proxy/keys/batch` flow through `batchKeyAction`.

## Detail Panel Structure

The rendered detail markup will be reorganized into stable sections:

- `detail-hero`: selected key label, status badge, compact scheduling facts, and a one-line health/risk summary.
- `detail-kpis`: six fixed KPI cells for requests, success, failures, 429, timeout, and latency.
- `detail-diagnostics`: two compact diagnostic blocks for cooldown and recent failures.
- `operation-feedback`: keeps existing semantic tones but improves title/time/message hierarchy.
- `detail-actions`: existing test/copy/reset/enable-disable actions in a stable grid.

## Batch Bar Structure

The bottom batch bar will keep the same IDs but improve content inside `#batchCount` and `.batch-actions`:

- Selected count becomes the primary phrase with secondary context in small text.
- Actions remain enable, disable, reset, and test, but CSS should make destructive and primary actions easier to scan.
- Mobile layout uses stable grid tracks and wraps text safely without hiding hit targets.

## Compatibility

- Existing tests that assert key detail content such as `最近失败原因` should still pass or be updated to the new equivalent copy when the assertion is checking UI structure rather than product semantics.
- Existing batch action IDs and button labels remain available for selectors and accessibility.
- CSS must avoid nested cards and preserve the current restrained dark data-product palette.

## Rollback

- Revert the changed Admin UI static files and test assertions for this task.
- No persisted data, schema, or backend state is affected.
