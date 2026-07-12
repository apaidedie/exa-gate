# Mobile refresh interval 44px

## Goal

On ≤760px, topbar `#refreshInterval` select and `#autoRefresh` label hit targets are ≥44px (currently 36px via `.top-actions .select, .top-actions label`).

## Evidence

- `.top-actions .select, .top-actions label, .refresh-status, .live-link-status { min-height: 36px }`
- Ghost buttons already 44px; interactive refresh interval + auto-refresh toggle lag behind
- Status badges may stay denser (non-button status text)

## Requirements

1. Explicit override for `#refreshInterval` and `.refresh-toggle` / `#autoRefresh` host label to 44px
2. Do not force status chips to 44 unless needed
3. Desktop density unchanged
4. Unit pin + e2e height
5. Screenshots output/session-147-refresh-interval/

## Acceptance

- [ ] ≤760 #refreshInterval ≥44px
- [ ] ≤760 auto-refresh label ≥44px
- [ ] verify 110 + e2e 7
