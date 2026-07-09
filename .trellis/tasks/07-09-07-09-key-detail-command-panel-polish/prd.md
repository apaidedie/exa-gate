# Polish key detail command panel

## Goal

Make the Admin UI key-detail workflow feel like a focused command panel: operators should understand a selected key's health, recent risk, cooldown state, and next action without scanning a stack of loosely related cards. The selected-key batch bar should also read as a controlled operation surface instead of a generic footer.

## Background

- The Admin UI is a static, CSP-safe HTML/CSS/ES module console under `src/admin-ui/`.
- Current key-detail rendering lives in `src/admin-ui/renderKeys.js` and mirrors into both desktop `#detailsBody` and mobile `#mobileDetailsBody`.
- Existing tests cover key actions, mobile details visibility, batch selection, import onboarding, audit governance, motion hooks, and responsive hit targets.
- Project UI direction is a restrained dark operational SaaS/data-product interface. Visual polish must come from hierarchy, spacing, semantic status color, stable layout, and concise Chinese copy, not from adding dependencies, external assets, or decorative effects.

## Requirements

- R1: Rework selected key details into a clearer diagnostic hierarchy with a compact identity/status header, health summary, usage KPIs, cooldown/failure diagnostics, last-operation feedback, and action cluster.
- R2: Improve copy so operators can distinguish key identity, scheduling state, risk, cooldown, and safe follow-up actions without explanatory paragraphs.
- R3: Preserve all existing DOM ids, API contracts, security behavior, raw-key masking policy, and mirrored desktop/mobile detail targets.
- R4: Refine the selected-key batch bar with clearer selected-count context, action grouping, stable responsive layout, and no horizontal overflow on narrow viewports.
- R5: Keep implementation dependency-free: no React, router, component library, icon package, external fonts, CDN assets, inline scripts, or inline styles.
- R6: Keep motion subtle and respect the existing `prefers-reduced-motion` rule.
- R7: Maintain or improve existing automated coverage for key detail content, batch selection, mobile detail rendering, and static asset assertions.

## Acceptance Criteria

- AC1: Selecting a key renders a detail command panel that includes the selected key label, status badge, health/risk summary, 24h usage KPIs, cooldown details, operation feedback, recent failure summary, and key actions.
- AC2: Running a detail test action updates the operation feedback in both desktop and mobile detail targets without breaking the existing action flow.
- AC3: Selecting one or more table checkboxes shows a batch command bar with improved count/context copy and all four existing batch actions still reachable.
- AC4: Desktop and mobile rendered QA confirm no horizontal overflow, readable detail hierarchy, reachable key actions, and stable batch bar layout at representative widths.
- AC5: `npx vitest run test/admin.test.ts`, `npm run test:e2e`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, and `npm run verify` pass.

## Out Of Scope

- Backend API changes, key scheduling behavior changes, raw key reveal policy changes, and database migrations.
- New frontend dependencies or framework rewrites.
- README/GitHub marketing refresh; this task is limited to the Admin UI key-detail and batch-command workflow.
