# Motion Token Consistency

## Goal

Replace remaining hardcoded transition timings (`.14s` / `.15s` / `.16s` / `.3s ease`) with `--motion-fast` / `--motion-medium` and `--ease-standard` so Admin Console motion is one system and `prefers-reduced-motion` remains effective.

## Requirements

- Map UI micro-transitions to `var(--motion-fast) var(--ease-standard)`.
- Map progress-like width fills to `var(--motion-medium) var(--ease-standard)`.
- Keep existing enter animations that already use tokens; do not remove reduced-motion block.
- Unit pins for at least one former hard-coded selector now using tokens.
- `npm run verify` green (e2e optional for pure CSS token swap).

## Acceptance Criteria

- [x] No residual `.14s ease` / `.15s ease` / `.16s ease` in admin.css transitions.
- [ ] Verify green.
