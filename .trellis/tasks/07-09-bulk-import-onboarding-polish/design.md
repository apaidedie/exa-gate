# Design

## UI Brief

- Audience: self-hosted operators configuring Exa API keys under time pressure, with enough technical context to understand keys, ids, and weights.
- Primary workflow: open key import, paste or load key lines, read the preview, and submit only when valid keys are present.
- Product archetype: operational SaaS / data product.
- Constraints: static HTML/CSS/ES modules, no new dependencies, CSP-safe assets, Chinese interface copy, existing dark tokens and tests.
- Source of truth: existing Admin Console design language, Trellis frontend specs, `ui-design-suite`, and `ui-ux-pro-max` guidance.
- States: empty, ready, warning, invalid-only, pending, drag-over, focus, reduced motion, mobile.
- Acceptance: focused tests, e2e import flow, desktop/mobile rendered QA, full `npm run verify`.

## Boundaries

- `src/admin-ui/index.html`: add semantic, static markup inside the existing modal only.
- `src/admin-ui/admin.css`: add token-driven styles for import readiness, preview recommendation, and responsive modal layout.
- `src/admin-ui/admin.js`: enhance preview rendering and microcopy while preserving parser and submit payload behavior.
- `test/admin.test.ts` and `test/e2e/admin-console.spec.ts`: update assertions for the new UI signatures without weakening existing behavior coverage.

## Interaction Model

- The modal opens directly into the textarea to preserve fast paste workflow.
- Static readiness cards explain accepted input, preflight behavior, and persistence/audit in a scan-friendly strip.
- The preview is the source of truth for submit eligibility. It shows counts plus a recommendation line: empty input, ready with no issues, ready with skipped rows, or blocked by invalid/no valid rows.
- The confirm button label can remain stable except during pending import; disabled state is enough for empty/invalid-only input.

## Accessibility And Motion

- Existing `role="dialog"`, `aria-modal`, `aria-describedby`, focus trap, Escape close, and focus return remain unchanged.
- New informational sections use semantic text and do not introduce fake interactive controls.
- Preview updates remain inside the existing polite live region.
- Modal and preview animations use existing motion tokens and are disabled under `prefers-reduced-motion: reduce`.

## Tradeoffs

- Do not add visible icon libraries; use typography, badges, borders, and semantic color to avoid dependency churn.
- Do not auto-fill examples into the textarea; preserving an empty paste target avoids accidental import noise.
- Keep copy short and operational rather than marketing-oriented.

