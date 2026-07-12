# Mobile Tabs 44px Touch Targets

## Goal

Primary console navigation on narrow/tablet layouts uses 44px tab hit targets.

## Problem

`.mobile-tabs .nav-item` is 38px by default and reduced to 34px at ≤760/≤480, below the console's established 44px mobile touch standard (workflow tiles, empty CTAs, recovery retry).

## Requirements

- Visible mobile tab items: min-height ≥44px at all breakpoints where `.mobile-tabs` is shown
- Preserve horizontal scroll, labels, active underline, and DOM hooks (`data-mobile-tabs`, role=tab)
- Keep density: avoid bloating vertical chrome more than needed
- E2e pin tab heights on 390
- Screenshots desktop-narrow/390 of tab bar

## Acceptance Criteria

- [x] CSS 44px mobile tab items
- [x] Verify + e2e green
- [x] Screenshots output/session-126-mobile-tabs
