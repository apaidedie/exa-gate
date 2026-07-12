# Harden Overview Alert Focus E2E

## Goal

Stop flaky `toBeFocused` failures on overview `alert-focus` after click, caused by SSE/refresh re-render replacing the alert button mid-assertion.

## Requirements

- E2E must not hold a stale locator across possible alert list re-renders.
- After clicking alert-focus, assert focus on a **fresh** query of the current `#alertList button[data-overview-signal-action="alert-focus"]` (or stable focus target from product).
- Prefer product-side focus that survives re-render only if needed; prefer test hardening first.
- Keep other overview signal tests unchanged unless the same flake class applies.
- `npm run verify` + e2e green.

## Acceptance Criteria

- [ ] Alert-focus path does not flake on detached/replaced nodes.
- [ ] Focus still verified after action (user-visible intent preserved).
- [ ] Full e2e suite passes.

## Notes

- Lightweight PRD-only.
