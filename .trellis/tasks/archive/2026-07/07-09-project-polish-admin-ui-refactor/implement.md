# Implementation Plan

## Checklist

1. Load frontend and general thinking specs before editing.
2. Audit current Admin Console selectors, E2E assertions, demo data, and static asset serving.
3. Consolidate `admin.css` into a coherent token-driven render layer and remove unnecessary accumulated overrides where safe.
4. Improve `index.html` copy and structure without breaking ids, role selectors, asset injection, or forms.
5. Add small JavaScript polish only where it improves loading/interaction feedback, accessibility, or responsive behavior without changing backend contracts.
6. Update render modules only for clearer operator copy, accessible attributes, or stable state classes.
7. Run formatting-neutral checks: `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`.
8. Start `npm run demo:ui` and inspect rendered desktop and mobile viewports; capture screenshots if useful for documentation.
9. Update docs assets only if a new screenshot is captured from the rendered demo and the change materially improves README credibility.
10. Review final diff for accidental selector changes, unrelated churn, generated files, and security-sensitive content.

## Validation Commands

```bash
npm run lint
npm test
npm run build
npm run test:e2e
npm run demo:ui
```

Rendered UI QA should cover:

- Desktop: 1440x960 or similar.
- Mobile: 390x844 or similar.
- Login screen, key pool, details panel, logs tab, audit/config tab, import modal, and batch selection if practical.

## Risky Files

- `src/admin-ui/index.html`: stable ids, role selectors, and asset injection patterns.
- `src/admin-ui/admin.css`: broad visual blast radius, responsive behavior, focus states, and overflow.
- `src/admin-ui/admin.js`: async actions, refresh loop, SSE, session auth, tab switching, batch actions.
- `src/admin-ui/renderKeys.js`: escaped server data, key rows, details panel, action buttons.
- `test/e2e/admin-console.spec.ts`: should only change if intentional UI structure changes require stronger coverage.

## Rollback Points

- After planning: no production code changed.
- After CSS/index copy pass: run build or E2E before touching JS.
- After JS/render pass: run E2E before any docs screenshot update.
- Before final: `git diff --check` and full verification commands.
