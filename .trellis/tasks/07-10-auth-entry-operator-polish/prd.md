# Auth Entry Operator Polish

## Goal

Make the Admin Console login entry feel like a controlled operational access point instead of a generic password card, while keeping the static vanilla UI, existing authentication flow, and demo-token convenience intact.

## UI Brief

- Audience: self-hosting operators and maintainers who need to enter a sensitive admin console quickly and confidently.
- Primary workflow: identify the access boundary, enter or fill the admin token, understand demo vs production behavior, and submit without ambiguity.
- Product archetype: operational SaaS / security-sensitive admin tool.
- Constraints: static CSP-compatible HTML/CSS/ES modules, no dependencies, no external fonts/assets, existing Chinese copy style, existing auth API and storage behavior.
- Source of truth: current `src/admin-ui/` tokens/components, frontend specs, README positioning, and `ui-design-suite` / `ui-ux-pro-max` guidance for dense operational UI.
- States: default, hover, focus, invalid login, demo-filled success hint, token visibility toggled, Caps Lock on, mobile viewport, reduced motion.

## Confirmed Facts

- Login markup lives in `src/admin-ui/index.html`, styles in `src/admin-ui/admin.css`, and behavior in `src/admin-ui/admin.js`.
- Existing login behavior validates through `verifyAdminToken()` and stores the session token through current browser storage rules.
- The demo helper fills `admin_local_token` and updates `authHintStatus`; this must remain available.
- Playwright already covers basic login structure and mobile overflow.

## Requirements

- Improve the login card hierarchy so the first screen communicates product identity, controlled access, and operational scope without adding marketing-style hero sections.
- Add compact trust/access signals using existing static content, such as local-session boundary, admin-token boundary, and upstream isolation.
- Add a visible Caps Lock warning for the admin-token field, driven by keyboard events and hidden otherwise.
- Keep token visibility toggle, demo-token fill, login error, focus behavior, and form submit behavior unchanged.
- Preserve CSP compatibility: no inline event handlers, external fonts, CDN assets, or new dependencies.
- Preserve mobile usability around 390px: no clipping, overlap, layout shift, or document-level horizontal overflow.
- Keep all login text concise and operational; do not add explanatory tutorial copy or a forced onboarding flow.

## Acceptance Criteria

- [x] Login screen shows a more polished access-boundary composition with compact trust/access signals.
- [x] Caps Lock warning appears only when Caps Lock is detected in the token field and clears when no longer active, without blocking submit.
- [x] Existing demo-token, token visibility, login error, and submit flows continue to work.
- [x] Static tests cover new login markup, CSS selectors, and Caps Lock JavaScript hooks.
- [x] Playwright verifies desktop and mobile login layout visibility, no horizontal overflow, Caps Lock warning behavior, and preserved login path.
- [x] `git diff --check`, targeted Vitest, Admin Console E2E, and `npm run verify` pass.

## Verification

- `git diff --check` passed with only the existing CRLF normalization warning for `src/admin-ui/index.html`.
- `npx vitest run test/admin.test.ts` passed: 30 tests.
- `npx playwright test test/e2e/admin-console.spec.ts` passed: 7 tests.
- `npm run verify` passed: secret scan, TypeScript lint, 109 Vitest tests, npm audit, and build.

## Out Of Scope

- Backend authentication changes, new token storage policy, password managers, OAuth, passkeys, external assets, new libraries, or a full console redesign.
- README screenshot refresh unless the login screen becomes part of the documented preview.
