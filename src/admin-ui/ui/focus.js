import { el } from '../state.js';

export function isUsefulFocusReturn(target) {
  if (!(target instanceof HTMLElement) || !document.body.contains(target)) return false;
  if (target === document.body || target === document.documentElement) return false;
  // Prefer interactive controls; ignore non-focusable containers left after overlay close.
  if (typeof target.focus !== 'function') return false;
  const tag = target.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'A') return true;
  if (target.isContentEditable) return true;
  const tabIndex = Number(target.getAttribute('tabindex'));
  return Number.isFinite(tabIndex) && tabIndex >= 0;
}

export function scheduleControlFocus(controlId, { select = false } = {}) {
  const apply = () => {
    const control = el(controlId);
    if (!control) return;
    if (typeof control.focus === 'function') control.focus();
    if (select) control.select?.();
  };
  // Double rAF covers list rebuild paint after filter reload; short retry covers a follow-up paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      setTimeout(apply, 48);
    });
  });
}

export function scheduleElementFocus(getTarget, { preventScroll = false } = {}) {
  const apply = () => {
    const target = typeof getTarget === 'function' ? getTarget() : getTarget;
    if (target && typeof target.focus === 'function') {
      if (preventScroll) target.focus({ preventScroll: true });
      else target.focus();
    }
  };
  // Double rAF covers modal/tab paint; short retry covers delayed layout after open/close.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      setTimeout(apply, 48);
    });
  });
}
