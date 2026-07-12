# Mobile Filter Summary Density Polish

## Goal

On narrow viewports, make log/audit filter summaries as dense and scannable as the key-filter strip, while keeping removable chips comfortably tappable.

## Problem

After dismissible chips landed, active log/audit filter rows still use a tall 1-column stack on mobile (`clear` full-width, chips wrap to 100% width). Key filters already use a denser 2-column active layout. Removable chips at 26px height are tight for touch.

## Requirements

- ≤760px: log/audit active filter summaries match key-filter density pattern (kicker hidden, compact padding, clear button not full-width stack)
- Removable chips: min-height ≥32px on mobile, horizontal scroll when many chips, not forced width:100% when active
- Empty-state strips stay compact
- Preserve DOM hooks and dismiss behavior
- E2e pins on 390px for key + log active filter density / chip remove
- Capture desktop + 390 screenshots for evidence

## Acceptance Criteria

- [x] CSS density rules for log/audit + larger chip targets
- [x] E2e green with mobile filter assertions
- [x] Trace-link overlap regression fixed via additive CSS (table-scroll min-height + trace z-index)
- [x] Screenshots under output/session-123-filter-density (desktop + 390 keys/logs)
