# Design: Clean Admin Console Dashboard

**Date:** 2026-07-15  
**Status:** Approved (user: C full simplify; overview reference dashboard)  
**Scope:** Visual + information-architecture cleanup of the static Admin Console

## Goal

Make the Admin Console feel **clean, simple, and operationally calm**—aligned with a modern usage dashboard—while keeping core ops capabilities (keys, logs, audit/config).

Reference feel (from user screenshot):

- Dark surface, generous spacing, soft cards
- Page title + subtle “updated at” meta
- One row of **four KPI cards**
- One **primary trend chart** with time-range chips
- Minimal chrome; secondary ops detail available but not competing for attention

## Non-goals

- New product features or new backend metrics
- React / bundler / component framework
- Rewriting proxy/scheduler behavior
- Full rewrite of a11y strings for every control (prefer shortening where safe)
- Pixel-perfect clone of the reference product (map concepts only)

## Constraints

- Keep static CSP-compatible HTML/CSS/ES modules under `src/admin-ui/`
- Prefer **CSS + layout HTML restructure** over logic rewrites
- Preserve **DOM ids / `data-*` hooks** used by JS and Playwright where possible
- When structure must change, update `test/e2e/admin-console.spec.ts` in the same change
- Run `npm run verify` and `npm run test:e2e` before claiming done

## Target experience

### Global visual system

- Dark background (`--bg`), slightly elevated cards (`--panel` / soft border)
- Consistent radius, padding scale, and type hierarchy (title / meta / metric / caption)
- Fewer nested “bands” and heavy borders
- Buttons: primary + quiet ghost; segmented control for time ranges
- Reduce kicker noise (“Admin Access Boundary” style labels stay only where needed for first-run)

### Overview (primary page)

| Zone | Content | Notes |
|------|---------|--------|
| Header | Title「概览」+ last updated time | Optional short status line |
| KPI row (4) | Healthy keys · Requests · Error rate · Alerts/cooldown | Large number + one secondary line |
| Primary chart | Request / failure / 429 trend | Reuse existing observability trend data |
| Time range | 1h / 24h / 7d (existing `timeRange`) | Segmented chips top-right of chart card |
| Secondary (de-emphasized) | Alerts short list and/or recent activity | Collapsed, compact list, or bottom section—not a third full “story” band |

**Remove or demote from default overview first screen:**

- Three-card insight band as primary layout (fold content into KPI + one next-step if needed)
- Full-width proxy flow map as hero (optional compact strip or drop from overview)
- Dense multi-meter “ops strip” and heavy governance chrome on overview

### Keys page

- Clean page header + one primary action (import)
- Single filter row (search + status chips); workflow tiles lighter or single row
- Table as the hero; batch bar stays but visually quieter
- Detail panel keeps function; reduce card-in-card density

### Logs page

- One filter strip; table primary
- Trace panel lighter chrome when open
- Empty states shorter copy

### Audit & config page

- Two clear sections: audit list vs runtime config
- Evidence/readiness blocks use same soft-card language; less stacked “status strips”

## Implementation approach

1. **Tokens & base components** — tighten `css/tokens.css` + shared card/button/chip styles in shell/controls.
2. **Overview HTML/CSS** — restructure `index.html` overview panel + `overview` CSS + minimal JS binding if layout ids move.
3. **Render paths** — `keys/render-summary.js` / `overview/render-metrics.js` output targets new KPI/chart DOM; keep data sources (`state`, `computeTotals`, trends API) unchanged.
4. **Other tabs** — density pass on keys/logs/audit panels (padding, header, toolbar).
5. **QA** — update e2e selectors only if required; screenshots optional; full verify + e2e.

## Data mapping (KPIs)

Suggested mapping (adjust only if implementation hits a missing field):

| KPI | Source |
|-----|--------|
| 健康密钥 | `totals.healthy` / `state.keys.length` |
| 请求量 | `totals.requests` or window from observability |
| 错误率 | `pct(failures, requests)` |
| 告警 / 冷却 | `alerts.length` and/or `totals.cooldown` |

Secondary lines: success rate, 429 count, disabled count as captions—not extra cards.

## Acceptance criteria

| ID | Criterion |
|----|-----------|
| UI1 | Overview first screen matches clean dashboard pattern: header + 4 KPIs + primary chart |
| UI2 | Secondary ops detail does not dominate overview |
| UI3 | Keys / logs / audit share the same density and card language |
| UI4 | No intentional product API / auth / proxy behavior changes |
| UI5 | `npm run verify` and `npm run test:e2e` green |
| UI6 | Existing critical flows still work: login, key actions, logs export, webhook test, import empty state |

## Risks

| Risk | Mitigation |
|------|------------|
| E2E coupled to old overview structure | Prefer keeping ids; batch e2e updates |
| Losing ops signal on overview | Keep alerts as compact list under chart |
| Scope creep into full product redesign | MVP stops after overview + density pass on other tabs |

## Out of scope for this pass

- New chart library (use existing bar/trend rendering unless trivial CSS enhancement)
- Billing / tokens / multi-account semantics from the reference product
- Mobile redesign beyond existing responsive breakpoints

## Success look

An operator opens the console and immediately sees: **are keys healthy, is traffic OK, what’s the error rate, anything on fire**—then one chart. Everything else is one click away without visual noise.
