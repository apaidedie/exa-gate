# Polish overview trend and alert experience

## Goal

Refine the Admin UI overview tab so an operator can scan service posture, traffic trend, and alerts from the first viewport with less interpretation work and stronger visual polish.

## Background

- The Admin Console is a static, CSP-safe HTML/CSS/ES module interface in `src/admin-ui/`.
- The overview tab already contains service summary, insight cards, metric cards, running posture, trend bars, and alert list sections.
- Tests rely on stable ids including `trendWindowLabel`, `trendSummary`, `trendBars`, `alertCount`, `alertList`, `insightWindow`, and the overview insight ids.
- UI stack detection found no frontend framework, no component library, and npm as the package manager; `ui-ux-pro-max` is the primary design skill for this slice.
- Art direction: quiet operational SaaS / data product, dark technical surfaces, restrained status color, dense but calm scan path.

## Requirements

- Preserve the static Admin UI stack: no React, router, component framework, external font, CDN, or new runtime dependency.
- Preserve existing DOM ids and data hooks unless tests are intentionally updated.
- Improve the trend panel with a compact, text-backed summary of the selected observation window, including total requests, failures, 429 pressure, and peak bucket.
- Improve alert rendering so active alerts have clearer hierarchy and severity labels, and the empty state communicates that the current observation window has no operator action required.
- Keep server-provided trend and alert text escaped through existing helpers before insertion into `innerHTML`.
- Keep responsive layout stable at desktop and mobile widths with no document-level horizontal overflow.
- Keep motion short, tokenized, and covered by the existing `prefers-reduced-motion` rule.

## Acceptance Criteria

- [ ] Overview trend panel shows a compact trend summary region tied to the selected time window and rendered from `state.observability.trends`.
- [ ] Trend summary handles empty trend data without blank or misleading UI.
- [ ] Alert center renders active alerts with severity, title, message, and a short action/status line; empty state is more polished than a plain sentence.
- [ ] Existing overview insight text still includes trend bucket/sample context required by E2E coverage.
- [ ] Desktop and mobile rendered QA confirm no horizontal overflow and verify the insight, trend summary, trend bars, and alert center are visible.
- [ ] `npx vitest run test/admin.test.ts`, `npm run test:e2e`, rendered QA, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass before the task is archived.

## Out of Scope

- Backend observability API contract changes.
- New charting libraries or external visual assets.
- Navigation architecture changes beyond the overview tab.
- README marketing screenshots or repository branding changes.
