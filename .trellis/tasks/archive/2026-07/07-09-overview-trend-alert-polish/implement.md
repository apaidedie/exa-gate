# Implementation Plan

## Steps

1. Add overview trend summary placeholders in `src/admin-ui/index.html` without renaming existing ids.
2. Extend `renderObservability.js` with small local helpers for trend summary aggregation, trend empty markup, alert severity labels, and alert card markup.
3. Update `admin.css` for the trend recap strip, empty chart state, alert cards, and responsive behavior.
4. Update static and E2E tests to assert the new overview structure and preserve existing behavior.
5. Add a task-local Playwright rendered QA script for desktop and mobile overview layout checks.
6. Run focused tests, rendered QA, full checks, and diff hygiene.
7. Commit implementation, archive task, record journal, and commit task wrap-up.

## Validation Commands

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- Rendered QA script in `.trellis/tasks/07-09-overview-trend-alert-polish/`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm run verify`

## Risk Points

- E2E selectors may depend on overview copy, so copy changes must keep required trend bucket/sample wording or update tests intentionally.
- `innerHTML` rendering must escape alert title and message values.
- Flex/grid changes in the overview can create mobile horizontal overflow; rendered QA must check document width.
- Trend bar nodes are replaced on each render, so QA should query the current DOM after waiting for visible text.

## Review Gates

- Before coding: frontend specs and UI QA references are read.
- Before full verification: focused static and E2E tests pass.
- Before archive: rendered QA records desktop and mobile measurements and screenshots under ignored output paths.
