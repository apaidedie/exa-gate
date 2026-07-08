# Developer Adoption And API Discoverability

## Goal

Make `exa-reverse-proxy` easier to evaluate, integrate, and trust from the GitHub repository by improving developer-facing discoverability around the admin/proxy API, deployment entry points, and repository metadata without changing core proxy semantics.

## Background And Confirmed Facts

- The project already has a strong runtime foundation: Node.js 22, Fastify, SQLite state, Docker deployment, admin console, Prometheus metrics, Grafana dashboard, OpenAPI documentation, CI, Docker publishing, issue templates, contributing guide, changelog, and security policy.
- The previous milestone rebuilt the static Admin Console and refreshed the README screenshot and positioning.
- `docs/openapi.json` exists but is only linked from README text; the service does not currently expose it as a browsable/static endpoint.
- The static admin UI serving code already has an asset manifest route and strict CSP route patterns in `src/admin/static.ts`.
- `scripts/copy-admin-ui.mjs` only copies admin UI runtime assets into `dist/`; docs assets are not runtime assets.
- The repository currently has no `.github/FUNDING.yml`, CodeQL workflow, or first-class API spec endpoint. Those are candidates, but this task should prefer changes that can be verified locally and do not require external accounts.

## Requirements

- Improve API discoverability for humans and tools by exposing the existing OpenAPI contract from the running service under a predictable `/_proxy/openapi.json` endpoint.
- Preserve existing admin UI static asset behavior, CSP headers, cache behavior, route contracts, and proxy/admin API semantics.
- Keep the OpenAPI source of truth in `docs/openapi.json`; avoid hand-maintaining a duplicate JSON payload in TypeScript.
- Add or update tests so the endpoint is covered for status, content type, cache behavior, and stable contract content.
- Update README and docs index so users can discover both the repository file and runtime endpoint.
- Avoid adding dependencies, hosted docs, Swagger UI assets, or third-party CDNs in this iteration.

## Acceptance Criteria

- [ ] `GET /_proxy/openapi.json` returns the existing OpenAPI document with `application/json` content type.
- [ ] The endpoint is cache-safe for a local control-plane contract, using `no-cache` or stricter behavior.
- [ ] The endpoint does not weaken admin UI CSP or static asset route handling.
- [ ] Tests cover the new endpoint and verify it includes the known title/version or route entries.
- [ ] README and `docs/README.md` mention the runtime OpenAPI endpoint.
- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, and `git diff --check` pass.

## Out Of Scope

- Rewriting the OpenAPI document or generating it from source automatically.
- Adding Swagger UI, Redoc, external CDN assets, or a docs website.
- Changing authentication or proxy behavior.
- Creating external funding or marketplace metadata that requires account-specific decisions.

## Open Questions

None. The user delegated product and implementation decisions, and the repository evidence supports a narrow runtime OpenAPI discoverability pass.
