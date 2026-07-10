# Repository Preview Polish

## Goal

Refresh and strengthen the GitHub-facing repository preview so the README immediately communicates a polished, production-ready Admin Console and a reproducible visual proof path.

## User Value

- Prospective users can judge the product from the README without cloning first.
- The screenshots reflect the current Admin Console polish instead of stale UI states.
- Future contributors can regenerate and verify preview assets through one documented command.

## Confirmed Facts

- README already references `docs/assets/admin-console.png` and `docs/assets/admin-console-mobile.png`.
- `npm run capture:preview` runs `scripts/capture-admin-preview.ts` and renders screenshots from `scripts/demo-ui-server.ts`.
- `test/demo.test.ts` already checks the capture command, README references, PNG dimensions, and non-empty asset sizes.
- Existing screenshots were written before the latest auth-entry polish commit and should be regenerated.
- The Admin Console stack must remain static HTML/CSS/ES modules with no external assets or new UI framework.

## Requirements

- Add a README-facing auth-entry preview asset that shows the new controlled access boundary and Caps Lock-ready token field without exposing secrets.
- Keep the existing desktop overview and mobile request-log screenshots, but regenerate them from the current demo UI.
- Update the capture script so all README-facing screenshots are generated in the same reproducible run.
- Update README and lightweight docs so the preview section explains the three preview states concisely: access boundary, desktop operations overview, mobile trace workflow.
- Extend static tests to pin the new asset path, command coverage, PNG dimensions, and non-empty bytes.
- Preserve the current CSP/no external assets/no new dependency posture.
- Keep docs copy concise and GitHub-first; avoid marketing filler, oversized claims, or unsupported metrics.

## Acceptance Criteria

- [x] `npm run capture:preview` generates `docs/assets/admin-auth-entry.png`, `docs/assets/admin-console.png`, and `docs/assets/admin-console-mobile.png`.
- [x] README references all three preview assets and describes what each screenshot proves.
- [x] `docs/README.md` and `scripts/README.md` document the expanded preview asset set.
- [x] `test/demo.test.ts` covers the new capture step and asserts the new PNG dimensions and non-empty byte size.
- [x] Targeted tests and full verification pass: `npx vitest run test/demo.test.ts`, `git diff --check`, and `npm run verify`.

## Verification

- `npm run capture:preview` regenerated the auth-entry, desktop overview, and mobile request-log screenshots from the local demo.
- `npx vitest run test/demo.test.ts` passed: 3 tests.
- `git diff --check` passed.
- `npm run verify` passed: secret scan, TypeScript lint, 109 Vitest tests, npm audit, and build.

## Out Of Scope

- Backend behavior changes, new Admin Console features, README restructuring beyond the preview section, external image generation, new fonts/assets/CDNs, and publishing to GitHub or Docker Hub.
