# renderKeys split Implementation Plan

> **For agentic workers:** Inline execution in current session.

**Goal:** Split `renderKeys.js` into UI-domain modules with stable barrel.

**Architecture:** `keys/render-{summary,workflow,table,details}.js` + optional `render-shared.js`; `renderKeys.js` re-exports.

**Tech Stack:** Static ESM Admin UI, existing static pipeline.

## Global Constraints

- R1 freeze: no DOM/copy/API changes
- Keep import path `./renderKeys.js`
- Register new assets in static.ts / copy-admin-ui.mjs / admin.test.ts
- `export async` never `async export`
