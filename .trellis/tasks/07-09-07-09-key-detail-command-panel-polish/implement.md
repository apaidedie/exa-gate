# Implementation Plan

## Checklist

1. Read task artifacts and relevant frontend specs through `trellis-before-dev`.
2. Inspect the current rendered key detail and batch bar behavior through source/tests.
3. Update `src/admin-ui/renderKeys.js` detail markup and batch count state with clearer hierarchy and copy.
4. Update `src/admin-ui/admin.css` for detail command panel, diagnostic blocks, action grid, batch bar, mobile constraints, and reduced-motion compatibility through existing global rules.
5. Update focused static/E2E assertions for the new UI structure and copy.
6. Add a rendered QA script under this task directory that exercises desktop and mobile selected-key details plus batch bar layout.
7. Run targeted tests, rendered QA, full verification, then commit.

## Validation Commands

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- Rendered QA script for this task
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm run verify`

## Risk Notes

- `renderDetailMarkup()` is string-built HTML. Escape all dynamic values and avoid introducing unescaped data paths.
- `setButtonPending()` mutates button text during operations; action button structure should keep text simple enough for restore behavior.
- Mobile details are mirrored from the same markup, so desktop visual hierarchy must also fit a single-column mobile panel.
- Batch bar is fixed-position and can hide content on small screens; rendered QA must check viewport overflow and reachable hit targets.
