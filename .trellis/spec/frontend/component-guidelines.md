# Frontend Component Guidelines

## Overview

Components are plain HTML/CSS/JavaScript patterns, not framework components. The UI must stay compatible with this CSP:

```text
default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'
```

## Static Component Patterns

- Use semantic HTML from `index.html` for forms, buttons, tables, tabs, dialogs, and status regions.
- Use `aria-live="polite"` for async feedback such as login errors and toast-style status.
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

## Accessibility

- Every icon-like glyph in navigation must be decorative with `aria-hidden="true"` unless it carries unique meaning.
- If a responsive breakpoint hides the desktop sidebar or primary tablist, provide an alternate visible tablist that uses the same `data-tab` targets and stays synchronized through `switchTab()`.
- Focus states must remain visible through `:focus-visible` for buttons, inputs, selects, chips, and navigation.
- Async buttons that can double-submit must set `disabled` and change visible text while pending.
- Respect `prefers-reduced-motion`; decorative continuous animation is not allowed.

## Common Mistakes

- Renaming a visible label without updating Playwright role selectors.
- Adding a new control without disabled and error states.
- Using color as the only signal for health, warning, or failure. Pair color with text.
- Adding inline event handlers or inline scripts; CSP blocks them.
