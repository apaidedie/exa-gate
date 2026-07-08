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

## Styling Patterns

- Use CSS custom properties in `admin.css` as the source of truth for color, radius, borders, shadows, and status tones.
- Keep the dark technical art direction: deep neutral surfaces, high-contrast text, restrained green/blue status language, amber warnings, red destructive states.
- Do not add external fonts or CDN styles. The CSP only allows self-hosted font/style sources.
- Avoid layout-shifting hover states. Hover/focus/disabled states may change color, border, opacity, or shadow, not dimensions.

## Accessibility

- Every icon-like glyph in navigation must be decorative with `aria-hidden="true"` unless it carries unique meaning.
- Focus states must remain visible through `:focus-visible` for buttons, inputs, selects, chips, and navigation.
- Async buttons that can double-submit must set `disabled` and change visible text while pending.
- Respect `prefers-reduced-motion`; decorative continuous animation is not allowed.

## Common Mistakes

- Renaming a visible label without updating Playwright role selectors.
- Adding a new control without disabled and error states.
- Using color as the only signal for health, warning, or failure. Pair color with text.
- Adding inline event handlers or inline scripts; CSP blocks them.
