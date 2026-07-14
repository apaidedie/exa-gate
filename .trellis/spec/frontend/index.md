# Frontend Development Guidelines

> Static Admin Console guidelines for this project.

## Overview

The frontend is a CSP-compatible vanilla HTML/CSS/ES module Admin Console in `src/admin-ui/`. It is served by `src/admin/static.ts`, copied during `npm run build` by `scripts/copy-admin-ui.mjs`, and verified with Playwright in `test/e2e/admin-console.spec.ts`.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Admin UI file ownership and module layout | Active |
| [Component Guidelines](./component-guidelines.md) | DOM, accessibility, and static component patterns | Active |
| [Hook Guidelines](./hook-guidelines.md) | Not applicable; no React or hook runtime | Not used |
| [State Management](./state-management.md) | Global state object and browser storage rules | Active |
| [Quality Guidelines](./quality-guidelines.md) | UI verification, visual QA, and CI expectations | Active |
| [Type Safety](./type-safety.md) | TypeScript boundary and safe JavaScript rendering rules | Active |

## Pre-Development Checklist

- Keep the console static: do not add React, a router, a component framework, external fonts, or CDN assets for ordinary UI work.
- Preserve DOM ids and `data-*` hooks used by `src/admin-ui/*.js` and `test/e2e/admin-console.spec.ts`; search before renaming.
- Check `src/admin/static.ts` before adding an asset. New served files must be listed in `assetPaths` and copied by `scripts/copy-admin-ui.mjs`.
- Keep CSS token-driven and CSP-compatible. Use CSS custom properties in `admin.css` (or modular CSS registered in the static pipeline); do not use inline styles for production UI state except existing dynamic text/status updates.
- Prefer the B3 domain module layout in `directory-structure.md` when extracting from `admin.js`; do not rename DOM contracts during pure refactors (R1).
- For pixel/layout changes, verify at mobile and desktop widths with Playwright or an equivalent rendered browser check.

## Quality Check

- Run `npm run verify` for type-check, tests, audit, secret scan, and build.
- Run `npm run test:e2e` for Admin Console structure, login, key actions, logs export, and webhook testing.
- Confirm `prefers-reduced-motion`, keyboard focus, disabled button states, and no horizontal page overflow after substantial UI changes.

**Language**: All code-spec documentation should be written in English.
