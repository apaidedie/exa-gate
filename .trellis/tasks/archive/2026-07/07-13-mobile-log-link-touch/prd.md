# Mobile log link-btn / log-key-link 44px

## Goal

On narrow viewports (≤760px), request-log interactive links (`.link-btn[data-trace-id]`, `.log-key-link`) meet ≥44px touch height without breaking table density on desktop or existing hit-target e2e geometry.

## Evidence / problem

- Base `.link-btn { min-height: 27px }`, `.log-key-link { min-height: 30px }`
- High-frequency: open trace by requestId, open key detail from log/trace
- e2e currently only requires height ≥26–28 on mobile
- ui-ux-pro-max: touch targets ≥44px

## Requirements

1. At `max-width: 760px`, `.log-panel .link-btn` and `.log-panel .log-key-link` (and trace panel key links) use `min-height: 44px` / height 44px.
2. Keep max-width / wrapping behavior so horizontal table scroll still works.
3. Optionally raise `.trace-shortcut` to 44px on the same breakpoint for consistency.
4. Desktop density unchanged.
5. Update e2e height thresholds for ≤760.
6. Unit pins + screenshots `output/session-141-log-links/`.

## Acceptance Criteria

- [ ] ≤760px link-btn and log-key-link ≥44px
- [ ] Desktop stays ~27–30px
- [ ] Trace open + key open still work in e2e
- [ ] verify 110 + e2e 7

## Constraints

- CSP CSS only; preserve data-trace-id / data-log-key-action hooks
