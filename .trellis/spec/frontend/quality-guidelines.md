# Frontend Quality Guidelines

## Overview

Admin Console quality is verified through TypeScript build boundaries, Vitest coverage for backend-admin behavior, Playwright for rendered UI behavior, and visual checks for responsive layout.

## Required Patterns

- Run `npm run test:e2e` after changing `src/admin-ui/`, `src/admin/static.ts`, or Admin Console copy used by role/text selectors.
- Keep `npm run verify` green before reporting readiness; it includes secret scan, lint, unit/integration tests, audit, and build.
- Keep `test/e2e/admin-console.spec.ts` aligned with intentional UI structure changes. Do not weaken it to hide a real workflow regression.
- Preserve screenshot assets only when they reflect a rendered local demo or app state. README-facing screenshots must have a reproducible capture command and static tests that pin the referenced file, command, dimensions, and non-empty PNG bytes.

## Visual QA Checklist

- Desktop and mobile widths have no document-level horizontal overflow.
- Topbar controls wrap without overlapping text.
- Tables may scroll internally, but the page shell should not force full-page horizontal scroll.
- Buttons, selects, chips, and inputs have visible focus and disabled states.
- `prefers-reduced-motion` disables non-essential motion.
- For UI regions that can re-render after async detail loads, forced refreshes, or SSE snapshots, rendered QA should wait for stable user-visible text, then query and measure the current DOM inside `page.evaluate()`. Do not keep a Playwright locator for a node that may be replaced before `scrollIntoViewIfNeeded()` or hit-target checks run.

## Tests Required

- UI structure/copy change: Playwright assertion for the affected operator path when the flow is user-visible.
- Responsive navigation change: Playwright must verify the hidden-sidebar breakpoint can still reach every primary tab without document-level horizontal overflow.
- Async action change: assertion that the button cannot double-submit or that feedback appears.
- Static asset change: `npm run build` must pass because asset hash injection is strict.

## Wrong vs Correct

### Wrong

```text
Only inspect admin.css and assume the layout works.
```

### Correct

```text
Run npm run test:e2e and capture or inspect rendered desktop/mobile widths when layout changes pixels.
```

### Wrong

```js
const actions = page.locator('#detailsBody .detail-actions');
await selectKey();
await actions.scrollIntoViewIfNeeded();
```

This can fail when the selected-key detail panel is re-rendered after the async failure summary arrives.

### Correct

```js
await selectKey();
await page.waitForFunction(() => document.querySelector('#detailsBody')?.textContent?.includes('已打开密钥'));
await page.evaluate(() => document.querySelector('#detailsBody .detail-actions')?.scrollIntoView({ block: 'nearest' }));
```
