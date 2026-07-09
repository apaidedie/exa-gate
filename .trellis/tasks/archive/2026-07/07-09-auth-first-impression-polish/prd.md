# Polish auth first impression

## Goal

Improve the Admin Console login screen so first-time operators immediately understand what the console controls, which token is required, and why the session is safe to use in a local or self-hosted deployment. The change should strengthen GitHub-demo first impression without changing authentication behavior.

## Background

- The long-running project goal prioritizes frontend UI/UX polish, simple elegant visuals, copy quality, and GitHub-ready presentation.
- The login screen is the first rendered product surface for demo users and newly deployed operators.
- Existing auth UI already includes demo token fill, administrator token explanation, password visibility toggle, focused login flow, and e2e coverage.
- The next improvement is stronger information hierarchy and first-screen confidence, not backend auth changes.

## Requirements

- Preserve current authentication API behavior, admin session storage, token fill helper, and existing DOM ids.
- Keep the login screen static, CSP-safe, and dependency-free.
- Add a compact capability/safety summary that communicates the console's main value after login: key pool control, observability, audit/config governance, and browser-local session behavior.
- Improve visual hierarchy so the login form still remains the primary action; supporting copy must not become a marketing landing page.
- Keep Chinese copy concise, operational, and accurate: administrator token is not an Exa API key and demo fill does not bypass backend validation.
- Maintain mobile fit with no horizontal overflow, no clipped text, and reachable touch targets.
- Preserve login focus behavior, demo token fill behavior, password visibility toggle, and error feedback.
- Respect existing dark operational SaaS/data-product art direction and reduced-motion behavior.

## Acceptance Criteria

- [x] Login screen includes a polished capability/safety summary using stable responsive layout and concise copy.
- [x] Primary login workflow remains obvious: token input, visibility toggle, demo fill, and submit are still reachable and visually dominant.
- [x] Demo token fill still sets `admin_local_token`, updates status copy, and focuses the login button.
- [x] Password visibility toggle still changes the input type and label text.
- [x] Invalid/empty login feedback remains visible through `#loginError`.
- [x] Desktop and mobile rendered QA confirm no document-level horizontal overflow and no text/control overlap on the auth screen.
- [x] Static and e2e tests cover the new auth summary signatures while preserving existing login behavior coverage.
- [x] Full project verification passes before commit.

## Out Of Scope

- Backend authentication or session API changes.
- New setup wizard, OAuth, or multi-step onboarding.
- New assets, fonts, component libraries, or animation dependencies.
- README screenshot regeneration unless this slice later explicitly touches public screenshots.
