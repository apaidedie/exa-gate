# Backend Quality Guidelines

## Overview

Backend and release work must preserve proxy compatibility, security posture, and deployability. GitHub-facing metadata is treated as a product surface and should be tested when changed.

## Required Patterns

- Use `npm ci` in docs and CI for reproducible installs.
- Keep `npm run verify` as the full local quality gate: secret scan, TypeScript lint, Vitest, high-severity npm audit, and build.
- Keep CI, Release, and Docker publish workflows on Node.js 22.x and run both `npm run verify` and `npm run test:e2e` before publishing artifacts.
- Keep GitHub CodeQL enabled for JavaScript/TypeScript with `security-events: write`, PR coverage, pushes to `main`/`master`, and a scheduled weekly run.
- Keep CI push triggers aligned with the repository's active default branch names. Until the repository is normalized, CI should run for both `main` and `master` pushes.
- Keep Dependabot enabled for npm, GitHub Actions, and Docker dependencies so routine security and runtime updates enter the same verified PR path.
- Keep Docker publishing aligned with `package.json` version and the public image name `al1ya/exa-reverse-proxy` unless intentionally rebranded.
- Keep repository links pointed at `https://github.com/apaidedie/exa-reverse-proxy`.
- Treat GitHub-facing README/docs navigation as executable project surface: task-oriented local Markdown links should be covered by static tests that reject external launch detours and missing local files.
- Keep `npm run scan:secrets` effective before and after the initial commit by scanning both tracked files and untracked non-ignored files.
- Keep `docs/openapi.json` aligned with every public probe and authenticated `/_proxy` management route. Route additions, removals, auth changes, and request-envelope changes should update the contract and its drift test in the same change.
- If runtime code serves a file from `docs/`, the build script must copy that file into `dist/` and tests must assert the copy path. The Docker image intentionally copies `dist/` but not `docs/`, so direct runtime reads from repository docs will work in source mode and fail in the published image.
- Keep `npm run setup:env` as the safe first-run path for source deployments: it must generate strong random required secrets, avoid printing secret values, and refuse to overwrite `.env` unless explicitly forced.

## Forbidden Patterns

- Do not lower audit coverage by removing `npm audit --audit-level=high` from `npm run verify`.
- Do not publish docs that include real tokens, raw Exa keys, or `.env` values.
- Do not advertise unsupported routes, config variables, or UI features in README/docs.
- Do not loosen the Admin Console CSP to make UI changes easier.

## Tests Required

- Dependency/security change: `npm audit --audit-level=high`, `npm run verify`.
- Secret-scan change: verify tracked and untracked non-ignored files are both included, then run `npm run scan:secrets`.
- Release metadata or docs URL/version change: update `test/project-hygiene.test.ts` if a drift check should persist.
- README/docs launch-navigation change: update static tests to pin the intended reader path and verify local Markdown links resolve.
- Security workflow/trust-signal change: verify `.github/workflows/codeql.yml`, README badges, and `test/project-hygiene.test.ts` stay aligned.
- CI trigger change: verify PR coverage remains enabled and pushes to both `main` and `master` still run the full gate.
- Dependency maintenance workflow change: keep `.github/dependabot.yml` covering npm, GitHub Actions, and Docker, then update `test/project-hygiene.test.ts` if scheduling or grouping conventions change.
- Docker/compose change: `docker compose config --no-interpolate`; use `docker build -t exa-reverse-proxy:local .` when image contents change.
- Admin route behavior change: Vitest coverage plus Playwright if the console workflow changes.
- Probe behavior change: test both success and failure semantics for `/_proxy/live` and `/_proxy/ready`, then update README/deployment docs and Dockerfile healthcheck if the contract changes.
- Management API contract change: update `docs/openapi.json`, README/docs links when needed, and `test/project-hygiene.test.ts` route drift checks.
- Runtime-served docs change: verify the source route with Vitest, run `npm run build`, and confirm the served file exists under `dist/docs/` or another copied runtime directory.
- Deployment setup script change: update `test/setup-env.test.ts`, user-facing deployment docs, and project hygiene checks.

## Wrong vs Correct

### Wrong

```yaml
- name: Verify project
  run: npm test
```

### Correct

```yaml
- name: Verify project
  run: npm run verify

- name: Verify Admin Console E2E
  run: npm run test:e2e

- name: Build Docker image
  run: docker build -t exa-reverse-proxy:ci .
```

The correct gate preserves audit/build coverage and verifies the actual browser console path.
