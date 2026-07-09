# Design

## Scope

This task improves the GitHub-facing presentation layer only. It touches README copy, documentation notes, the local screenshot capture helper, tests that keep preview assets reproducible, and tracked PNG preview assets.

## Approach

Keep `docs/assets/admin-console.png` as the stable desktop preview path to avoid breaking existing README links and tests. Add `docs/assets/admin-console-mobile.png` as a second tracked asset captured from the same local demo server.

The desktop capture should continue to show the key-pool workspace with a selected key detail state. The mobile capture should use a narrow viewport and show a populated request-log workspace so readers see that operational data remains usable on phone-sized screens.

README copy should move from a feature-list feel toward a fast evaluation path: product promise, why operators care, demo command, and real console preview assets. The tone stays Chinese-first and technical, without adding animated badges, external assets, or exaggerated claims.

## Compatibility

- Existing `docs/assets/admin-console.png` path remains unchanged.
- `npm run capture:preview` remains the only documented screenshot refresh command.
- The capture script still starts `scripts/demo-ui-server.ts` itself and does not require a pre-running server.
- No runtime proxy API contract changes.
- No frontend dependency or framework changes.

## Visual Direction

The UI/art direction remains operational SaaS and data product: dark technical surfaces, compact hierarchy, restrained green/blue signals, amber warnings, and real product screenshots instead of decorative marketing imagery.

## Risks

Screenshots can become flaky if captured before the demo UI finishes rendering. The script should wait for specific populated rows and active tab states before taking each screenshot.
