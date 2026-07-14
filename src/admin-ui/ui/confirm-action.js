import { el } from '../state.js';
import { showErrorToast } from './toast.js';
import { isUsefulFocusReturn, scheduleElementFocus } from './focus.js';

let confirmActionFocusReturn = null;
let pendingConfirmAction = null;

export function isConfirmActionOpen() {
  const modal = el('confirmActionModal');
  return Boolean(modal && modal.classList.contains('modal-open') && !modal.hidden);
}

function focusableConfirmActionControls() {
  const modal = el('confirmActionModal');
  if (!modal) return [];
  return Array.from(modal.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'))
    .filter((control) => !control.disabled && !control.hidden && control.offsetParent !== null);
}

function rememberConfirmActionFocusReturn() {
  const active = document.activeElement;
  confirmActionFocusReturn = isUsefulFocusReturn(active) ? active : null;
}

function restoreConfirmActionFocus() {
  const returnTarget = confirmActionFocusReturn;
  confirmActionFocusReturn = null;
  scheduleElementFocus(() => (isUsefulFocusReturn(returnTarget) && returnTarget.isConnected ? returnTarget : null));
}

export function trapConfirmActionFocus(event) {
  if (event.key !== 'Tab' || !isConfirmActionOpen()) return;
  const controls = focusableConfirmActionControls();
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function closeConfirmAction() {
  const modal = el('confirmActionModal');
  if (!modal || !isConfirmActionOpen()) {
    pendingConfirmAction = null;
    return;
  }
  modal.classList.remove('modal-open');
  modal.hidden = true;
  modal.dataset.confirmAction = '';
  modal.setAttribute('aria-label', '危险操作确认：待选择。触发危险操作后会在此确认或取消');
  pendingConfirmAction = null;
  const title = el('confirmActionTitle');
  const text = el('confirmActionText');
  const accept = el('confirmActionAccept');
  const cancel = el('confirmActionCancel');
  const closeBtn = el('closeConfirmAction');
  if (title) {
    title.textContent = '确认操作';
    title.setAttribute('aria-label', '确认操作：待选择。触发危险操作后会在此确认或取消');
  }
  if (text) {
    text.textContent = '此操作会写入管理员审计，确认后继续。';
    text.setAttribute('aria-label', '确认说明：此操作会写入管理员审计，确认后继续。可确认执行或取消返回');
  }
  if (accept) {
    accept.setAttribute('aria-label', '确认执行危险操作。确认后会写入管理员审计，可取消返回控制台');
    accept.textContent = '确认';
  }
  if (cancel) cancel.setAttribute('aria-label', '取消确认操作，返回控制台。可继续当前运维操作');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭确认对话框，返回控制台。可继续当前运维操作');
  restoreConfirmActionFocus();
}

export function openConfirmAction(spec) {
  const modal = el('confirmActionModal');
  const title = el('confirmActionTitle');
  const text = el('confirmActionText');
  const accept = el('confirmActionAccept');
  if (!modal || !title || !text || !accept || !spec?.id || typeof spec.run !== 'function') return;
  rememberConfirmActionFocusReturn();
  pendingConfirmAction = spec;
  modal.dataset.confirmAction = spec.id;
  const titleText = spec.title || '确认操作';
  const bodyText = spec.body || '此操作会写入管理员审计，确认后继续。';
  const acceptLabel = spec.acceptLabel || '确认';
  title.textContent = titleText;
  text.textContent = bodyText;
  accept.textContent = acceptLabel;
  title.setAttribute('role', 'status');
  title.setAttribute('aria-live', 'assertive');
  title.setAttribute('aria-atomic', 'true');
  title.setAttribute('aria-label', '确认操作：' + titleText + '。请阅读说明后确认或取消');
  text.setAttribute('role', 'status');
  text.setAttribute('aria-live', 'assertive');
  text.setAttribute('aria-atomic', 'true');
  text.setAttribute('aria-label', '确认说明：' + bodyText + '。可确认执行或取消返回');
  accept.setAttribute('aria-label', acceptLabel + '：' + titleText + '。确认后会写入管理员审计并立即执行');
  const cancel = el('confirmActionCancel');
  if (cancel) cancel.setAttribute('aria-label', '取消“' + titleText + '”，返回控制台不执行。可继续当前运维操作');
  const closeBtn = el('closeConfirmAction');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭“' + titleText + '”确认，返回控制台。可继续当前运维操作');
  modal.setAttribute('aria-label', '危险操作确认：' + titleText + '。' + bodyText + '。可确认执行或取消');
  modal.hidden = false;
  modal.classList.add('modal-open');
  scheduleElementFocus(() => cancel || accept);
}

export async function acceptConfirmAction() {
  const spec = pendingConfirmAction;
  if (!spec || typeof spec.run !== 'function') {
    closeConfirmAction();
    return;
  }
  closeConfirmAction();
  try {
    await spec.run();
  } catch (error) {
    showErrorToast(error, '操作未完成');
  }
}
