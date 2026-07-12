# Login Entry Accessible Names

## Goal

Give first-run login controls explicit accessible names and relate the demo fill action to its safety hint.

## Problem

`#fillDemoToken` and `#loginButton` rely on visible text only. The adjacent safety note (`#authHintStatus`) is not programmatically associated with the demo fill control, so assistive tech may miss that demo fill still requires server validation.

## Requirements

- `#fillDemoToken` has a descriptive `aria-label` and `aria-describedby="authHintStatus"`.
- `#loginButton` has an explicit `aria-label` for the admin console entry action.
- Unit pins; verify + e2e green (login flow unchanged).

## Acceptance Criteria

- [x] Demo fill announces purpose + linked safety hint.
- [x] Login submit has explicit accessible name.
- [x] Verify + e2e green.
