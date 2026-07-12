# Login Error Assertive A11y

## Goal

Make admin login failures immediately announced and programmatically associated with the token field.

## Problem

`#loginError` only uses `aria-live="polite"` with no `role="alert"`. Failed logins and empty-token validation do not set `aria-invalid` or `aria-describedby` on `#loginToken`, so assistive tech may miss or deprioritize the error.

## Requirements

- Non-empty login errors: `role="alert"`, `aria-live="assertive"`, visible message.
- Clear errors: remove alert role/live override, empty text.
- On error: `#loginToken` gets `aria-invalid="true"` and `aria-describedby` includes `loginError` (keep caps hint when relevant).
- On clear/input: remove invalid state; restore caps-only describedby when needed.
- Empty-token submit uses the same helper as API failures.
- Unit + e2e pins; verify green.

## Acceptance Criteria

- [x] Failed/empty login announces assertively via alert.
- [x] Token field invalid + describedby while error present.
- [x] Verify + e2e green.
