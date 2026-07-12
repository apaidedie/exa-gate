# Live Continuity Session Status

## Goal

Make live console continuity visible: operators can tell whether the SSE feed is live, reconnecting, or that the admin session expired and re-login is required—without confusing it with the existing refresh-failure recovery banner.

## Requirements

- Surface a compact live-link status near refresh status (`#liveLinkStatus`) with states:
  - `live` — EventSource connected
  - `reconnecting` — SSE error, auto-retry scheduled
  - `offline` — no session / stream closed intentionally (login shell)
  - optional: keep session expiry as login redirect, not a fourth noisy topbar state if re-auth is immediate
- Wire `connectEventStream`: `onopen` → live; `onerror` → reconnecting + existing 5s reconnect; successful reconnect → live.
- On API 401 / session-expired style failures during console use: close stream, clear session, show login with clear copy (not only a generic toast).
- Do not replace `#refreshRecovery` (HTTP refresh failure remains separate).
- Preserve DOM ids / CSP vanilla patterns; unit pins + E2E for live status markup and reconnecting copy.
- Desktop + narrow topbar: no document horizontal overflow; status can truncate gracefully.

## Acceptance Criteria

- [x] Live status element exists and updates on SSE open/error/reconnect.
- [x] Session expiry mid-session returns to login with explicit copy.
- [x] Refresh recovery banner still works independently.
- [x] `npm run verify` and e2e pass.

## Notes

- Lightweight PRD-only.
- Prefer status chip over a second full-width banner.
