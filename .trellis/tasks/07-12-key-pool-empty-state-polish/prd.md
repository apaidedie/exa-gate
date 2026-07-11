# Key Pool Empty State Polish

## Goal

Close the remaining Key Pool empty-state gap: when keys exist but search/status filters match nothing, replace the plain table sentence with a structured operational empty state that matches Logs/Audit patterns and offers a one-click clear-filters recovery path.

## Background And Confirmed Facts

- First-run zero-key empty state is already polished (`.first-run-empty` + `data-empty-action="import"`).
- Filtered empty still renders a single plain cell:
  - table: `没有匹配的密钥。请调整搜索、状态筛选或清空过滤条件。`
  - detail: `当前筛选没有匹配的密钥。清空搜索或状态筛选后再查看详情。`
- Logs and Audit already use structured empty states with kicker, title, message, and step chips (`log-empty-state`, `audit-empty-state`).
- `clearKeyFilters()` and `#clearKeyFilters` already exist; empty-row actions already delegate via `button[data-empty-action]` on `#keysBody`.
- Stack remains CSP-compatible vanilla HTML/CSS/ES modules in `src/admin-ui/`. No framework, Tailwind, or CDN assets.

## UI Brief

- Audience: operators filtering the Key Pool during incident triage or bulk work.
- Primary workflow: notice “no matches”, understand active filter context, clear filters without hunting the summary chip bar, return to the full key list.
- Product archetype: dense operational SaaS console; calm, compact, diagnostic.
- Constraints: preserve first-run onboarding, table structure, DOM ids, `data-*` hooks, existing `clearKeyFilters()` behavior, and mobile density rules.
- Art direction: reuse existing empty-state language (kicker + title + body + chips + primary action), token-driven dark surfaces, no marketing hero.

## Requirements

- R1: When `state.keys.length > 0` and filtered rows are empty, render a structured Key Pool filtered empty state (not a single plain sentence).
- R2: The filtered empty state must include a primary action that clears search + status filters using the existing `clearKeyFilters()` path (`data-empty-action="clear-filters"` or equivalent reuse).
- R3: Keep zero-key first-run empty state distinct from filtered empty state (import vs clear filters).
- R4: Detail pane empty copy for the filtered case should stay consistent and actionable, without inventing a second filter system.
- R5: Update static/unit and Playwright coverage so the structured filtered empty state and clear action cannot regress silently.
- R6: No backend/API, dependency, asset-path, or data-format changes.

## Acceptance Criteria

- [x] With keys present and no filter matches, Keys table shows a structured filtered empty state (kicker/title/message/chips + clear action).
- [x] Empty-state primary action clears key search and status filter, restores rows, and reuses existing toast feedback.
- [x] Zero-key first-run empty state still shows import onboarding, not the filtered empty state.
- [x] Existing filter summary, workflow chips, pagination, import modal, and key table behavior remain intact.
- [x] Desktop and 390px rendered checks show no document-level horizontal overflow for the empty state.
- [x] `git diff --check`, focused admin tests, Admin Console E2E path for filtered empty/clear, and `npm run verify` pass.

## Out Of Scope

- Redesigning first-run onboarding copy or import modal.
- Changing key filter semantics, chip counts, or sort behavior.
- Adding empty-state illustrations, animation libraries, or multi-step wizards.
- Backend/filter API changes.

## Notes

- Lightweight task: PRD-only is sufficient; implementation follows existing log/audit empty-state patterns.
- Highest-value gap after Session 65 (repository launch polish): Key Pool filtered recovery still lags Logs/Audit empty-state quality.
