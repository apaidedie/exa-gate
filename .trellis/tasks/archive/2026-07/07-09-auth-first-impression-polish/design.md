# Design

## UI Brief

- Audience: self-hosted operators and GitHub evaluators running the demo or deploying the proxy for the first time.
- Primary workflow: understand the required administrator token, fill or paste it, and enter the console.
- Product archetype: operational SaaS / data product with a security-sensitive first screen.
- Constraints: static HTML/CSS/ES modules, no new dependencies, CSP-safe, Chinese UI copy, existing dark tokens, desktop and mobile targets.
- Source of truth: current Admin Console design language, Trellis frontend specs, `ui-design-suite`, and `ui-ux-pro-max` guidance.
- States: default, demo-filled, empty submit, invalid submit, password visible/hidden, focused controls, mobile, reduced motion.
- Acceptance: static assertions, Playwright login flow, desktop/mobile rendered QA, full `npm run verify`.

## Boundaries

- `src/admin-ui/index.html`: add semantic supporting markup inside the existing auth card only.
- `src/admin-ui/admin.css`: style the auth summary using existing tokens and responsive constraints.
- `src/admin-ui/admin.js`: avoid logic changes unless tests reveal a focus or state regression.
- `test/admin.test.ts` and `test/e2e/admin-console.spec.ts`: add assertions for the new auth summary and preserve existing login path assertions.

## Interaction Model

- The login card remains a focused operator entry point, not a landing page.
- A compact summary strip sits between the headline and token field to explain what the admin console controls.
- Existing demo helper remains secondary but visible for local evaluation.
- Empty and invalid token feedback continues through the existing `#loginError` live region.

## Accessibility And Motion

- New summary content is informational and non-interactive.
- Existing label/input relationships stay intact.
- The password visibility button keeps its accessible label and visible state text.
- No new large motion is required; global reduced-motion behavior remains sufficient.

## Tradeoffs

- Use text and tokenized panels instead of new icon libraries to keep CSP and dependency posture simple.
- Do not add a full setup wizard; this slice improves first impression without changing product flow.
- Keep the card width controlled so mobile screens do not become dense or horizontally scrollable.

