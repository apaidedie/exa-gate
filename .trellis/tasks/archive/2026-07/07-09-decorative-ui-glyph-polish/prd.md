# Replace decorative UI glyphs

## Goal

Improve Admin Console visual polish by replacing structural decorative text glyphs with CSS-drawn icon marks that are stable across system fonts, CSP-compatible, and aligned with the restrained operational UI direction.

## Evidence

- `src/admin-ui/index.html` currently uses text glyphs for login and navigation decoration: `◇`, `↪`, `◈`, `◐`, `▤`, `◉`, and `◁`.
- `src/admin-ui/admin.js` restores `↪` into the login button and toggles sidebar collapse icons by changing text to `◁` / `▷`.
- `ui-ux-pro-max` guidance says structural icons should not rely on emoji or font-dependent symbols; use vector-like shapes and consistent sizing instead.
- The repo is static HTML/CSS/ES modules with strict CSP, no external font or icon library, so CSS pseudo-elements are the lowest-risk replacement.

## Requirements

- Replace decorative glyph text in login input, login submit, navigation tabs, and sidebar collapse with semantic CSS icon classes.
- Preserve visible labels, DOM ids, `data-*` hooks, button roles, aria labels, and tab behavior.
- Keep decorative icons `aria-hidden="true"` and avoid adding meaningful text that screen readers would announce.
- Do not add icon libraries, SVG files, external assets, external fonts, inline scripts, or inline styles.
- Keep active, hover, collapsed sidebar, mobile tab, login loading, and reduced-motion behavior stable.

## UI Brief

- Audience: operators using the Admin Console in desktop and mobile browsers.
- Primary workflow: navigate between overview, key pool, logs, audit, and login without visual noise or font-dependent artifacts.
- Product archetype: operational SaaS / data product.
- Source of truth: current static Admin Console, frontend spec, `ui-ux-pro-max` structural icon guidance, and rendered browser checks.
- States to preserve: login idle/loading, desktop sidebar expanded/collapsed, mobile tabs, active nav item, hover/focus, reduced motion.
- Acceptance: static tests prove glyph removal and CSS icon rules; Playwright proves login, navigation, collapse, and mobile tabs still work; rendered QA confirms desktop/mobile visual stability.

## Acceptance Criteria

- [x] `src/admin-ui/index.html` no longer contains the decorative glyphs `◇`, `↪`, `◈`, `◐`, `▤`, `◉`, `◁`, or `▷`.
- [x] `src/admin-ui/admin.js` no longer writes `↪`, `◁`, or `▷` into the UI; it toggles CSS state instead.
- [x] Navigation, login, and sidebar collapse use CSS icon classes with token-driven color, size, border, and active states.
- [x] Existing login, tab navigation, sidebar collapse, mobile navigation, key actions, logs, and webhook E2E flows still pass.
- [x] Rendered QA confirms no horizontal overflow and the CSS icons render at desktop 1440x960 and mobile 390x844.
- [x] Validation passes: targeted Admin UI tests, Playwright E2E, lint, full tests, build, verify, and `git diff --check`.

## Out Of Scope

- No new navigation items or IA changes.
- No route, backend, state, or API changes.
- No full icon system, icon package, SVG sprite, or asset pipeline.
- No change to README screenshots unless the preview task is revisited separately.
