# Implementation Plan

## Steps

- Update `scripts/capture-admin-preview.ts` to capture the existing desktop preview and a new mobile preview from one demo-server run.
- Update `README.md` so the first third of the document has a clearer product promise, a stronger quick-evaluation path, and both preview assets.
- Update `docs/README.md` and `scripts/README.md` to document that the preview capture command writes both desktop and mobile assets.
- Update `test/demo.test.ts` so static checks cover the new mobile asset path, dimensions, README references, and script behavior.
- Run `npm run capture:preview` to regenerate tracked preview images.
- Visually inspect both PNGs and run targeted/full validation.

## Validation

- `npm run capture:preview`
- `npx vitest run test/demo.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

## Rollback Notes

All changes are isolated to README/docs/scripts/tests/assets. Rollback is a normal git revert of this task commit; no migration or state cleanup is required.
