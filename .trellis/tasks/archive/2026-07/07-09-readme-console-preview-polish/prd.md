# Polish README console preview

## Goal

Make the repository presentation feel more credible and star-worthy by improving the README's first-screen value proposition and showing reproducible desktop plus mobile Admin Console previews.

## Background

- The project is a self-hosted Exa API reverse proxy and control plane for teams that need key pooling, failover, auditability, observability, and a static Admin Console.
- `README.md` already has Chinese positioning, badges, a 60-second demo path, Docker deployment, security notes, and one reproducible desktop screenshot at `docs/assets/admin-console.png`.
- `scripts/capture-admin-preview.ts` currently captures only one desktop viewport, and `test/demo.test.ts` asserts that screenshot exists and is non-empty.
- UI stack detection found no frontend framework, component library, animation package, or design token package; the console remains static HTML/CSS/ES modules with no external fonts or CDN assets.

## Requirements

- Keep the README concise, Chinese-first, and operationally focused: Exa key governance, production reliability, audit/observability, and fast local evaluation should be obvious above the fold.
- Add a mobile Admin Console preview asset generated from the real demo UI so GitHub readers can see that the console is responsive, not only desktop-polished.
- Keep screenshot generation deterministic and local: no real Exa API call, no external image/font/CDN dependency, and no production secrets.
- Keep documentation links and scripts aligned so `npm run capture:preview` remains the single documented way to refresh README preview assets.
- Do not add frontend dependencies or convert the static UI stack.

## UI Brief

- Audience: developers and operators evaluating a self-hosted Exa API gateway for team usage.
- Primary workflow: decide quickly whether the project solves key pooling, failover, audit, and observability well enough to try the demo.
- Product archetype: operational SaaS / data product, not a marketing landing page.
- Source of truth: current README, static Admin Console, demo server, existing dark technical UI direction, and `ui-ux-pro-max` design-system guidance.
- States to show: a populated desktop key-pool workspace and a populated narrow/mobile console state with real data.
- Acceptance: tests assert both PNG assets are generated at expected dimensions, README/docs reference both assets correctly, and rendered screenshots are visually checked.

## Acceptance Criteria

- [x] `README.md` communicates the product promise, trial path, and console value clearly in the first third of the file without adding noisy marketing copy.
- [x] `README.md` embeds both desktop and mobile Admin Console previews using tracked assets under `docs/assets/`.
- [x] `scripts/capture-admin-preview.ts` captures both preview assets from `npm run demo:ui` data and keeps the existing desktop screenshot path stable.
- [x] `docs/README.md` and `scripts/README.md` document the dual-preview capture behavior.
- [x] Tests cover the new mobile preview asset, expected dimensions, and README/docs references.
- [x] Validation passes: targeted preview tests, `npm run capture:preview`, relevant lint/build checks, and screenshot visual sanity review.

## Out Of Scope

- No runtime proxy behavior changes.
- No new Admin Console controls or backend API fields.
- No new frontend framework, CSS library, CDN asset, external font, or image dependency.
- No GitHub Actions, Docker, or deployment behavior changes.
