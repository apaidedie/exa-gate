# Refresh admin console preview screenshots

## Goal

Refresh README-facing Admin Console preview screenshots so the GitHub project page reflects the newly polished global action bar.

## Requirements

- Use the existing reproducible capture command instead of hand-editing images.
- Keep the existing asset paths stable:
  - `docs/assets/admin-console.png`
  - `docs/assets/admin-console-mobile.png`
- Do not change runtime UI code unless the capture command exposes a real visual defect.
- Preserve README references and static tests that pin the capture command/assets.

## Acceptance Criteria

- [x] `npm run capture:preview` completes successfully.
- [x] Desktop and mobile preview PNG files are updated and remain non-empty valid PNG files.
- [x] Static tests covering README preview assets pass.
- [x] `npm run build`, `git diff --check`, and relevant tests pass before archive.

## Out Of Scope

- UI redesign beyond fixing defects discovered during capture.
- README copy rewrite.
- Adding new preview formats or external image tooling.
