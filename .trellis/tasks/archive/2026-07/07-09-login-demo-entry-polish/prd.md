# Polish login demo entry

## Goal

Improve the Admin Console login and demo entry experience so GitHub visitors who run `npm run demo:ui` immediately understand that they are in a safe local demo, while production operators still see a clear, secure admin-token boundary.

This is a focused UI/UX slice under the larger project polish goal. It should reduce first-run friction without weakening auth, adding external assets, or introducing a framework.

## Confirmed Facts

- `README.md` now promotes `npm run demo:ui` with `admin_local_token` as the fastest trial path.
- `scripts/demo-ui-server.ts` seeds a local-only demo with `admin_local_token` and fake upstream data, but the login page currently has no visible demo-specific context.
- `src/admin-ui/index.html` renders the static login card and `src/admin-ui/admin.js` handles token submit, visibility toggle, session restore, and errors.
- `src/admin-ui/admin.css` already has a dark operational art direction, tokenized surfaces, short transitions, and responsive login layout.
- Existing tests in `test/admin.test.ts` and `test/e2e/admin-console.spec.ts` assert login structure, copy, and browser flows.

## Requirements

- Preserve real authentication. Do not bypass admin-token verification, auto-fill production secrets, or store new sensitive data.
- Make the login page more self-explanatory for both demo and production users: admin token purpose, safe boundary, and what happens after login should be scannable before submitting.
- If demo-specific copy or actions are added, they must be safe in production and must not imply that `admin_local_token` works outside the demo server.
- Keep the UI static, CSP-compatible, dependency-free, and aligned with the existing dark operational visual system.
- Improve visual hierarchy and polish without adding decorative blobs/orbs, oversized marketing copy, nested cards, or layout-shifting hover states.
- Keep mobile login usable without horizontal overflow or overlapping text.

## Acceptance Criteria

- [x] Login page includes a compact, polished trust/demo guidance area that clarifies the admin-token boundary and local demo token.
- [x] Login flow, show/hide token control, invalid-token error, and session restore continue to work.
- [x] Admin Console E2E covers the updated login guidance on desktop and mobile.
- [x] Static UI tests cover the new copy and CSS hooks.
- [x] Rendered QA confirms desktop and mobile login states have no text overlap or horizontal overflow.
- [x] `npm run lint`, relevant Vitest tests, `npm run test:e2e`, `npm run build`, and `npm run verify` pass.

## Notes

- UI brief: audience is self-hosting developers and small teams evaluating the demo or operating the console; primary workflow is entering the admin token confidently; archetype is operational SaaS; source of truth is existing static UI, README demo path, and auth tests; acceptance requires browser-rendered desktop/mobile checks.
