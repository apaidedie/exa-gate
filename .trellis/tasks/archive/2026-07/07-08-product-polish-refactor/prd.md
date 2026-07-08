# Product polish and refactor

## Goal

Turn Exa Reverse Proxy into a polished, trustworthy, GitHub-ready open-source project by improving the surfaces users judge first: secure dependencies, focused proxy/admin capabilities, refined Admin Console UI/UX, clear documentation, and repeatable verification.

## Confirmed facts

This is a Node.js 22 TypeScript project with Fastify, SQLite via better-sqlite3, Vitest, Playwright, Docker assets, and a static Admin Console in `src/admin-ui/`. After `npm ci`, `npm run lint` exits 0 and `npm test` reports 17 files and 100 tests passing. `npm audit --json` reports one high severity direct vulnerability in `undici` below 7.28.0. UI stack detection found no framework, styling library, component library, or animation package, so UI work should stay lightweight and static.

## Requirements

The dependency graph must have no high severity production audit finding. The Admin Console must remain static and CSP-compatible, without adding React or a large component system. The UI must be more refined through coherent tokens, tighter hierarchy, responsive layout, visible focus, reduced-motion support, better empty/loading/error feedback, and concise operator copy. Core proxy/admin APIs must remain compatible unless a change clearly removes risk or friction. Documentation must make production evaluation easy: quick start, security model, feature value, verification commands, and demo path.

## Acceptance criteria

- `npm audit --audit-level=high` exits 0.
- `npm run lint`, `npm test`, and `npm run build` exit 0.
- Admin Console Playwright coverage continues to pass, or changes only for intentional product copy/structure updates.
- The Admin Console keeps login, overview, key management, request logs, audit/config, batch import, batch actions, trace view, metrics, and webhook actions.
- The UI is usable at desktop and tablet widths, avoids main-shell text overflow, exposes visible keyboard focus, and respects `prefers-reduced-motion`.
- README and docs match the implemented feature set and do not advertise unsupported behavior.

## Out of scope

No cloud service, hosted SaaS backend, billing, user accounts, or frontend framework migration. No repeated micro-polishing after the main security, UI, and documentation improvements are in place. No API compatibility removal solely for aesthetic cleanup.
