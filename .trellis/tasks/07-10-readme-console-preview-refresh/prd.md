# README Console Preview Refresh

## Goal

Improve the GitHub first impression by making the README desktop preview show the strongest current Admin Console view: the Overview tab with the proxy flow map, live health signals, trends, and alerts. Keep mobile preview focused on the request-log trace workflow.

## Background

- `README.md` uses `docs/assets/admin-console.png` and `docs/assets/admin-console-mobile.png` as visible proof of the product UI.
- `scripts/capture-admin-preview.ts` currently captures desktop after selecting a key detail, while the README copy says desktop shows global operation context.
- The Overview tab now has a proxy flow map and better first-viewport explanation of client token -> proxy -> key pool -> Exa upstream.
- Screenshots must remain real rendered output from `npm run capture:preview` and must be tested for existence, dimensions, and non-empty PNG bytes.

## Requirements

- Update the desktop preview capture flow to land on the Overview tab after login and wait for the proxy flow map/trend/alert UI before screenshotting.
- Keep the mobile preview on the request-log trace path unless a stronger mobile workflow is already available from existing UI.
- Adjust README/docs copy so the preview labels accurately describe the new screenshot focus.
- Update tests that pin capture commands, screenshot assets, or README copy.
- Do not add external assets, fonts, frameworks, or synthetic mockup images.

## Acceptance Criteria

- [x] `npm run capture:preview` regenerates both README screenshots successfully.
- [x] Desktop screenshot displays the Overview tab and includes the proxy flow map area.
- [x] README preview copy references Overview/global operations rather than a stale key-detail view.
- [x] Static tests cover the updated capture flow and screenshot references.
- [x] `git diff --check`, targeted static tests, and `npm run verify` pass before archive.

## Out Of Scope

- Backend API changes.
- New screenshot assets beyond the existing two README preview PNGs.
- Replacing the mobile trace screenshot with an unrelated marketing composition.
