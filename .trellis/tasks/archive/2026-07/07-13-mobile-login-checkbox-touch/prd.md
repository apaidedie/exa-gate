# Mobile login eye and key checkbox 44px

## Goal

On narrow viewports (≤760px), expand first-run/login password visibility (`#toggleLoginToken.login-eye`) and key selection checkboxes (`.key-checkbox`) to ≥44px touch targets without breaking desktop density.

## Evidence / problem

- `.login-eye { height: 30px }` — below 44pt on mobile login (first-run path)
- `.key-checkbox { width/height: 15px }` — far below 44px; high-frequency batch selection
- ui-ux-pro-max: touch targets ≥44px; password visibility toggle is a standard a11y control

## Requirements

1. At `max-width: 760px`, `.login-eye` / `#toggleLoginToken` min-height/height ≥44px, min-width ≥44px.
2. At same breakpoint, `.keys-panel .key-checkbox` hit box ≥44×44 (size input and/or cell padding).
3. Desktop unchanged (eye ~30px, checkbox ~15px).
4. Unit pins + e2e measure where practical.
5. Screenshots `output/session-142-login-checkbox/`.

## Acceptance Criteria

- [ ] Mobile login eye ≥44px
- [ ] Mobile key checkbox ≥44px bounding box
- [ ] Desktop density preserved
- [ ] verify 110 + e2e 7

## Constraints

- Preserve DOM ids and checkbox selection behavior
- CSP CSS only
