import { el } from '../state.js';

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
