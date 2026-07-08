# Refresh admin console preview asset

## Goal

Refresh the GitHub-facing Admin Console preview so visitors can see the current polished UI before running the project. The preview should reinforce the repo's first impression: simple, elegant, operational, and credible.

## User Value

- GitHub visitors can quickly judge the console quality from the README.
- Maintainers have a reproducible way to validate the screenshot is rendered from the local demo rather than stale artwork.
- The project better supports the broader goal of looking production-ready and star-worthy.

## Confirmed Facts

- `README.md` already links `docs/assets/admin-console.png` in the "控制台预览" section.
- `npm run demo:ui` starts a seeded local Admin Console without real Exa keys.
- The frontend is a static Admin Console in `src/admin-ui/` and must stay CSP-compatible with no new framework or CDN dependency.
- Playwright is already used for Admin Console E2E verification.

## Requirements

- Re-render `docs/assets/admin-console.png` from the current local demo UI, not from a hand-made mock.
- Capture a state that shows the primary console value: key pool, metrics, details, and operational polish.
- Preserve README's existing lightweight structure unless a small copy tweak is needed to frame the preview accurately.
- Keep the preview asset reasonably sized for the repository and avoid adding generated debug artifacts outside the existing `docs/assets` or `output/` conventions.
- Do not add frontend dependencies, external fonts, or CDN assets.

## Acceptance Criteria

- [ ] `docs/assets/admin-console.png` is updated from a live local render of the seeded demo console.
- [ ] The screenshot is non-empty and visually shows the current Admin Console, including the key pool and right-side detail/operation area on desktop.
- [ ] README still references the preview image and gives a clear first-run path.
- [ ] Any screenshot generation or validation helper added by the task is documented or covered by project tests.
- [ ] Run `npm run lint`, focused docs/static tests, `npm run test:e2e`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check`.

## Out of Scope

- Redesigning the Admin Console layout in this task.
- Adding a marketing landing page.
- Replacing the screenshot with a hand-drawn or AI-generated mock.

## Notes

- Lightweight frontend/documentation asset task; PRD-only is sufficient.
