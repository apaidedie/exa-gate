# Config Panel Narrow Density

## Goal

Pack the 9 short config KV cards into a denser 2-column layout so Audit+Config is scannable on desktop and 390px without multi-screen scroll of single-column cards.

## Requirements

- `.config-body` uses a 2-column grid for short fields; preserve focus rings (`data-config-focus`) and posture targets.
- Reduce padding/gap modestly; mono values still wrap, no horizontal page overflow.
- ≤480px may stay 1-col if 2-col clips; prefer 2-col through 390 when readable.
- Evidence strip + posture jump-to-detail still work.
- Unit CSS pins; screenshots desktop + 390; verify + e2e.

## Acceptance Criteria

- [ ] Config body is multi-column denser layout.
- [ ] Focus/posture highlighting still visible.
- [ ] No document horizontal overflow at 390.
- [ ] `npm run verify` + e2e green.
