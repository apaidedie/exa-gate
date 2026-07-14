export function setButtonPending(button, pendingText) {
  if (!button) return () => {};
  const previousText = button.textContent;
  const previousDisabled = button.disabled;
  const previousBusy = button.getAttribute('aria-busy');
  const previousAria = button.getAttribute('aria-label');
  const busyLabel = String(pendingText || '正在处理') + '。请稍候，完成后可继续当前操作';
  button.disabled = true;
  button.dataset.pending = 'true';
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-label', busyLabel);
  button.textContent = pendingText;
  return () => {
    button.disabled = previousDisabled;
    delete button.dataset.pending;
    if (previousBusy === null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', previousBusy);
    if (previousAria === null) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', previousAria);
    button.textContent = previousText;
  };
}

export function setButtonBusy(button, pendingText = '正在处理') {
  if (!button) return () => {};
  const previousDisabled = button.disabled;
  const previousBusy = button.getAttribute('aria-busy');
  const previousAria = button.getAttribute('aria-label');
  const busyLabel = String(pendingText || '正在处理') + '。请稍候，完成后可继续当前操作';
  button.disabled = true;
  button.dataset.pending = 'true';
  button.setAttribute('aria-busy', 'true');
  button.setAttribute('aria-label', busyLabel);
  return () => {
    button.disabled = previousDisabled;
    delete button.dataset.pending;
    if (previousBusy === null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', previousBusy);
    if (previousAria === null) button.removeAttribute('aria-label');
    else button.setAttribute('aria-label', previousAria);
  };
}
