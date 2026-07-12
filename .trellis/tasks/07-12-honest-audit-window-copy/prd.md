# Honest Audit List Window Copy

## Goal

Make the admin audit list honestly communicate that it shows a recent non-paginated window (API `limit=12`), matching the request-log pager honesty pattern.

## Problem

Audit loads only the latest 12 entries, but the panel subtitle and filter idle copy can read like a full audit history. Operators may miss older evidence without exporting.

## Requirements

- Panel head shows live count for the loaded window.
- Footer hint states recent window · max 12 · non-paginated.
- Idle filter summary mentions the recent window, not “all audits”.
- Unit pins for copy + limit; e2e asserts visible honesty strings.
- No API/data format change.

## Acceptance Criteria

- [x] Honest count + window hint present and updated on render.
- [x] Filter idle copy mentions recent window.
- [x] `npm run verify` + e2e green.
