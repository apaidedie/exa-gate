# Polish bulk import onboarding experience

## Goal

Improve the Admin Console bulk import and first-run key onboarding experience so a new operator can understand supported input, preview risk, and import keys with confidence from desktop or mobile. The change should raise first-impression quality without adding framework complexity or changing backend import semantics.

## Background

- The user asked for broad project optimization with emphasis on frontend UI/UX, visual polish, copy, motion, and a simple elegant product feel.
- The Admin Console is a CSP-safe static interface in `src/admin-ui/` using vanilla HTML, CSS, and ES modules.
- Existing import support already includes text paste, `.txt` / `.csv` / `.json` file loading, parsed preview, duplicate/invalid line reporting, modal focus handling, and e2e coverage.
- The next high-value improvement is not a new parser or backend route; it is stronger operator guidance, safer pre-submit confidence, and better responsive visual structure around the import path.

## Requirements

- Keep the existing import API contract and parser behavior compatible: submitted payload must still be derived from the same parsed preview model shown in the modal.
- Preserve existing DOM ids and automation hooks used by `src/admin-ui/admin.js` and `test/e2e/admin-console.spec.ts`.
- Add a compact import readiness layer that communicates three operator concerns before submit: accepted formats, duplicate/invalid handling, and secure local persistence/audit behavior.
- Improve empty/initial preview copy so first-time users see the next action and expected outcome before entering data.
- Improve ready/warning preview hierarchy so valid, duplicate, and invalid counts are scannable without reading every issue line.
- Keep the modal usable on narrow mobile widths without horizontal overflow, clipped text, or undersized primary controls.
- Keep visuals aligned with the current dark operational SaaS/data-product direction: dense, calm, token-driven, and restrained.
- Respect reduced-motion preferences for modal/preview motion.
- Do not add React, Tailwind, icon packages, external fonts, CDN assets, or new runtime dependencies.

## Acceptance Criteria

- [x] Import modal includes a polished onboarding/readiness section with stable responsive layout and concise Chinese copy.
- [x] Import preview renders meaningful empty, ready, and warning/error states, including a clear primary recommendation line.
- [x] Confirm button remains disabled when there are no valid parsed keys or while import is pending.
- [x] Existing keyboard focus behavior remains intact: focus enters the modal on open, Tab stays inside, Escape closes, and focus returns to the opener.
- [x] Desktop and mobile rendered QA confirms no document-level horizontal overflow and no obvious text/control overlap in the import modal.
- [x] Static tests cover the new markup/CSS/JS signatures for the onboarding/readiness layer.
- [x] Existing focused UI and e2e tests continue to pass.
- [x] Full project verification passes before commit.

## Out Of Scope

- Backend import API changes.
- A new file parser or new accepted file type.
- New onboarding screens outside the Admin Console key import flow.
- Replacing the static frontend stack.
