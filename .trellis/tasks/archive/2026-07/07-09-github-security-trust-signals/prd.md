# GitHub Security Trust Signals

## Goal

Strengthen repository trust signals for potential GitHub users by adding first-party security analysis visibility and keeping the public README/docs aligned with the project's verified security posture.

## Background And Confirmed Facts

- The project already runs `npm run verify` in CI, Docker publish, and release workflows.
- Dependabot is enabled for npm, GitHub Actions, and Docker dependencies.
- The repository has `.github/SECURITY.md`, issue templates, PR template, changelog, and contribution docs.
- There is no CodeQL workflow or README badge for code scanning.
- Security-oriented repository metadata is a meaningful adoption signal for a self-hosted proxy handling API keys and admin tokens.

## Requirements

- Add a GitHub Actions CodeQL workflow for JavaScript/TypeScript that runs on pull requests, pushes to `main`/`master`, and a weekly schedule.
- Keep workflow permissions minimal and compatible with GitHub code scanning.
- Update README badges or security section so users can see CodeQL/security posture quickly.
- Update repository hygiene tests so future changes keep CodeQL and security docs visible.
- Do not add third-party scanning services, external accounts, or runtime dependencies.

## Acceptance Criteria

- [ ] `.github/workflows/codeql.yml` exists and analyzes JavaScript/TypeScript.
- [ ] CodeQL runs for PRs, pushes to `main`/`master`, and a scheduled weekly check.
- [ ] README includes a CodeQL badge or equivalent visible trust signal.
- [ ] Tests assert the CodeQL workflow and README signal remain present.
- [ ] `npm run lint`, `npm test`, `npm run build`, and `git diff --check` pass.

## Out Of Scope

- Adding external SaaS security tools or scorecards that require more policy decisions.
- Changing runtime security headers, auth behavior, Docker publishing, or dependency versions.
- Pushing or configuring repository settings in GitHub UI.

## Open Questions

None. The user delegated implementation decisions, and CodeQL is a low-risk first-party GitHub improvement.
