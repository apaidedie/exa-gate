# Key Pool Row Health Signals

## Goal

Make the Key Pool table easier to scan by turning each key row into a compact operational signal, so operators can identify healthy, cooling, disabled, and error-prone keys without opening the detail pane first.

## Confirmed Facts

- The Admin Console is a static vanilla HTML/CSS/ES-module UI under `src/admin-ui/`.
- Key Pool rows are rendered in `src/admin-ui/renderKeys.js` from existing key fields and helper functions.
- Existing row data already includes request, success, failure, 429, timeout, status, cooldown, and last error fields.
- The UI has a dark operational art direction and must keep dense table behavior on desktop and mobile.
- No backend API, persistence, or data contract change is needed.

## Requirements

- Add a row-level health signal to the Key Pool table using existing key metrics.
- The signal must pair tone with text, not rely on color alone.
- The signal must summarize the most useful operator interpretation, such as healthy dispatching, waiting for samples, cooling, disabled, failures, 429 pressure, or timeout pressure.
- Keep existing table actions, selection, sorting, filters, DOM ids, and `data-*` hooks stable.
- Keep generated row content escaped with existing `esc()` helpers.
- Preserve desktop and mobile table usability with no clipping, overlap, layout shift, or page-level horizontal overflow.

## Acceptance Criteria

- [x] Key Pool rows show a compact health signal derived from existing key fields.
- [x] Healthy, sample-empty, cooldown, disabled, failure, 429, and timeout states have distinct text labels and accessible labels.
- [x] Static tests cover the new row markup and helper logic.
- [x] Playwright tests verify visible desktop and mobile row signals and table hit-target behavior.
- [x] `git diff --check`, targeted tests, Admin Console E2E, and `npm run verify` pass.

## Out Of Scope

- Backend/API changes, new key metrics, new persisted fields, and new UI libraries.
- Full Key Pool table redesign or column removal.
- README screenshot refresh unless the default preview visibly changes.
