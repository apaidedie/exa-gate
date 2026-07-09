# Implementation Plan

## Steps

- Replace glyph text spans in `src/admin-ui/index.html` with CSS icon class spans while preserving labels, roles, ids, and `aria-hidden` attributes.
- Update `src/admin-ui/admin.js` so login reset restores the CSS login icon and sidebar collapse toggles an `is-collapsed` class on the icon instead of writing chevron text.
- Add CSS rules for `.login-icon`, `.login-submit-icon`, `.nav-icon`, and icon variant classes.
- Update static tests in `test/admin.test.ts` to assert glyph removal and CSS icon rules.
- Extend or rely on existing Playwright coverage for login, desktop nav, mobile nav, and sidebar collapse behavior; add a collapse assertion if needed.
- Run rendered QA at 1440x960 and 390x844.

## Validation

- `npx vitest run test/admin.test.ts`
- `npm run test:e2e`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify`
- `git diff --check`

## Rollback Notes

Rollback is isolated to static UI shell files and tests. If CSS icons regress navigation visuals, revert the task commit; no data migration or backend cleanup is needed.
