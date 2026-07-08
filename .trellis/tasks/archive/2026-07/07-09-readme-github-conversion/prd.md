# README GitHub conversion polish

## Goal

Improve the GitHub landing experience so a new reader can understand the project value, run the local demo, see the admin console, and trust the maintenance/security posture within the first minute.

## Confirmed Facts

- `README.md` already includes CI, CodeQL, Docker, version, and license badges.
- The repo provides a real local demo via `npm run demo:ui` with `admin_local_token` and a seeded admin console.
- The README already includes `docs/assets/admin-console.png`; the image still represents the main console because recent modal work is hidden until interaction.
- Project hygiene tests pin several README-facing strings and trust signals.
- The project exposes `docs/openapi.json` and serves it at `/_proxy/openapi.json`.

## Requirements

- Strengthen the README opening with a concise value proposition for self-hosted Exa key pooling, failover, and observability.
- Add a clear “60-second demo” path with exact commands, URL, admin token, and expected result.
- Preserve existing deployment, security, OpenAPI, and operations details.
- Make the feature surface easier to scan without turning the README into a marketing landing page.
- Keep all claims grounded in repository-supported behavior; do not invent benchmarks or adoption claims.
- Preserve existing badge and Docker Hub references required by project hygiene tests.
- Keep documentation in Chinese to match the current README.

## Acceptance Criteria

- [ ] A first-time GitHub reader can identify the project purpose from the first screen.
- [ ] The README contains an exact local demo command path with `npm ci`, `npm run demo:ui`, `http://127.0.0.1:8787`, and `admin_local_token`.
- [ ] The README explains what the demo proves without requiring a real Exa API key.
- [ ] The README highlights trust signals: CI/CodeQL, OpenAPI, Docker image, security model, and verification commands.
- [ ] Existing README tests and project hygiene checks remain green.
- [ ] `git diff --check` passes.

## Notes

- This is a lightweight docs/conversion task; PRD-only is sufficient.
