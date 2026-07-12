# Mobile insight next-action 44px

## Goal

On ≤760px, overview `#insightNextActionButton.insight-action` is consistently ≥44px tall (remove conflicting 34px override).

## Evidence

- Base `.insight-action { min-height: 34px }`
- Mobile has both `min-height: 34px` and a later group rule `min-height: 44px` — fragile cascade
- Primary overview CTA for next-step workflow; ui-ux-pro-max touch ≥44px

## Requirements

1. Explicit `#insightNextActionButton.insight-action` / `.insight-action` mobile rule: min-height/height 44px
2. Remove or override the 34px mobile-only assignment
3. Desktop may stay 34px
4. Unit pin + e2e height on 390/760 overview
5. Screenshots output/session-144-insight-action/

## Acceptance

- [ ] ≤760 insight action ≥44px
- [ ] Desktop ~34px
- [ ] verify 110 + e2e 7
