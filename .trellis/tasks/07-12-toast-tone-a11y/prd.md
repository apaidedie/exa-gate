# Toast Tone Accessible Announcements

## Goal

Frame transient toast feedback with tone-aware accessible names so success, warning, and error are not color-only.

## Problem

`#toast` has `role="status"` and `aria-live="polite"`, but only visual classes (`good`/`warn`/`bad`). Assistive tech hears the message without severity framing, and failures stay polite.

## Requirements

- `data-toast-tone` set on each show.
- `aria-label` = tone prefix + message (`成功提示：` / `注意：` / `错误：`).
- `aria-atomic="true"` so the full announcement is read.
- Failures use `aria-live="assertive"`; good/warn stay `polite`.
- Unit pins; verify green.

## Acceptance Criteria

- [x] Tone attributes + labels present in showToast.
- [x] Bad toasts assertive; others polite.
- [x] Verify + e2e green.
