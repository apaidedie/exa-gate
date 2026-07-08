# Implementation plan

## Goal

Ship a focused product polish pass that improves security posture, Admin Console quality, documentation, and verification without turning the repository into a different stack.

## Files and responsibilities

`package.json` and `package-lock.json` own dependency posture and verification scripts. `src/admin-ui/index.html`, `src/admin-ui/admin.css`, and the UI ES modules own console structure, visual system, copy, loading feedback, motion, and interaction states. `test/` owns regression coverage for any behavior change. `README.md`, docs, and examples own project positioning and evaluator onboarding.

## Steps

- Refresh dependency posture by updating vulnerable direct dependencies, then run audit, lint, tests, and build.
- Add a failing regression test before any backend behavior change; keep no production backend edit without a red test first.
- Refine Admin Console structure and copy in static HTML while keeping existing ids used by JS and tests.
- Replace ad-hoc visual styling with a coherent token pass in CSS, including focus states, reduced-motion handling, responsive shell behavior, button/loading states, modal polish, and empty states.
- Improve small UI interaction feedback in JS only where it removes double-submit risk or unclear async state, with Playwright or unit coverage when behavior changes.
- Update README and docs so installation, security posture, Admin Console preview, Docker deployment, verification, and API surface match the product.
- Run `npm run lint`, `npm test`, `npm run build`, `npm audit --audit-level=high`, and Admin Console E2E when UI structure changes.

## Validation commands

Use `npm audit --audit-level=high` for security posture, `npm run lint` for TypeScript, `npm test` for unit/integration behavior, `npm run build` for distributable output, and `npm run test:e2e` for browser coverage after UI changes.

## Risk notes

Do not rename DOM ids used by `src/admin-ui/*.js` or Playwright unless all references are updated together. Do not add external fonts because the current CSP allows only self-hosted font sources. Do not add a frontend framework for this pass. Do not loosen CSP to make UI work easier. Keep manual edits routed through `apply_patch`.
