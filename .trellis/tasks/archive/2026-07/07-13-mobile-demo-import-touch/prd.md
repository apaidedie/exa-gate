# Mobile demo token and import file 44px

## Goal

On ≤760px, first-run login demo fill (`#fillDemoToken.demo-token-btn`) and bulk-import file picker (`#importFileButton` / `.import-dropzone .file-label`) meet 44px touch height.

## Evidence

- `.demo-token-btn { min-height: 32px }` — first-run path
- `.import-dropzone .file-label { min-height: 36px }` — under generic 36px mobile control rule
- ui-ux-pro-max: touch ≥44px; empty/first-run guidance needs tappable CTAs

## Requirements

1. Mobile: demo-token-btn min-height/height 44px
2. Mobile: import file button min-height/height 44px (beat 36px ghost-btn rule)
3. Desktop density preserved
4. Unit pins + e2e/auth metrics for fillDemoToken on 390
5. Screenshots output/session-143-demo-import/

## Acceptance

- [ ] 390 demo token ≥44px
- [ ] 390 import file button ≥44px when modal open
- [ ] verify 110 + e2e 7
