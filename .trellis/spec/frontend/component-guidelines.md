# Frontend Component Guidelines

## Overview

Components are plain HTML/CSS/JavaScript patterns, not framework components. The UI must stay compatible with this CSP:

```text
default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'
```

## Static Component Patterns

- Use semantic HTML from `index.html` for forms, buttons, tables, tabs, dialogs, and status regions.
- Use `aria-live="polite"` for async feedback such as login errors and toast-style status.
- Toast feedback must use `showToast(message, tone)` with exactly one semantic class: `good` for completed actions, `warn` for non-fatal blocked actions or policy constraints, and `bad` for failed network/API/clipboard/import actions.
- Use real `button`, `input`, `select`, and `textarea` controls. Do not replace controls with clickable `div` elements.
- Render table rows and detail cards in `render*.js` with `esc()` for untrusted or server-provided text.

## Import And Bulk Action Modals

- When a modal previews parsed operator input, derive the submitted payload from the same parsed preview model that controls the primary button state. Do not maintain a separate parser for submit.
- Keep destructive or bulk primary actions disabled for empty input and while the request is pending.
- Treat malformed object-like lines as invalid preview issues instead of falling back to raw text submission.
- Client-side previews may skip duplicate values or duplicate explicit ids before submit, but the server remains the final authority for existing-key conflicts.
- Escape any text inserted into preview HTML, including issue messages, even when current messages are fixed strings.

## Styling Patterns

- Use CSS custom properties in `admin.css` as the source of truth for color, radius, borders, shadows, and status tones.
- Keep the dark technical art direction: deep neutral surfaces, high-contrast text, restrained green/blue status language, amber warnings, red destructive states.
- Do not add external fonts or CDN styles. The CSP only allows self-hosted font/style sources.
- Avoid layout-shifting hover states. Hover/focus/disabled states may change color, border, opacity, or shadow, not dimensions.
- For modal actions, drop-zone buttons, and other primary dialog controls, set a local rendered target of at least `36px` high instead of relying only on the global `32px` control baseline. Browser subpixel rounding can make a nominal `32px` CSS minimum render below the QA threshold.
- In flex-based panels, keep non-scrolling control/status regions such as filter summaries, trace panels, and pagers at `flex: 0 0 auto`; let only the intended scroll container absorb remaining height. If a content-driven control region can shrink below its rendered children, mobile hit testing may target the following panel instead of the visible button.
- Motion must be short and operational: use tokenized durations around 120-220ms and animate only opacity, transform, color, border, or shadow. Any added animation must remain covered by the global `prefers-reduced-motion` rule.

## Accessibility

- Every icon-like glyph in navigation must be decorative with `aria-hidden="true"` unless it carries unique meaning.
- If a responsive breakpoint hides the desktop sidebar or primary tablist, provide an alternate visible tablist that uses the same `data-tab` targets and stays synchronized through `switchTab()`.
- If a responsive breakpoint hides a desktop detail pane, provide a mobile equivalent that reuses the same rendering source and action delegation. Keep the mobile pane collapsed until the operator explicitly selects an item so it cannot cover or displace primary table actions on initial load.
- If a mobile workflow depends on a small control inside a horizontally scrollable table, provide an equivalent in-panel action near the relevant state. The fallback should use the same `data-*` action contract and event delegation as the table control so desktop and mobile behavior cannot diverge.
- Dialogs must move focus into the modal on open, trap Tab and Shift+Tab while open, close on Escape, and return focus to the opener when it is still connected.
- Focus states must remain visible through `:focus-visible` for buttons, inputs, selects, chips, and navigation.
- Async buttons that can double-submit must set `disabled` and change visible text while pending.
- Respect `prefers-reduced-motion`; decorative continuous animation is not allowed.

## Common Mistakes

- Renaming a visible label without updating Playwright role selectors.
- Adding a new control without disabled and error states.
- Using color as the only signal for health, warning, or failure. Pair color with text.
- Adding inline event handlers or inline scripts; CSP blocks them.
