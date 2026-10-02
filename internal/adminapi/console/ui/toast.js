import { el } from '../state.js';

let toastTimer;

export function syncToastLift() {
  const bar = el('batchBar');
  const toast = el('toast');
  let lift = 0;
  if (bar && !bar.hidden) {
    const height = Math.ceil(bar.getBoundingClientRect().height || 0);
    if (height > 0) lift = height + 12;
  }
  document.documentElement.style.setProperty('--toast-lift', lift + 'px');
  if (toast) {
    if (lift > 0) toast.setAttribute('data-toast-lift', 'batch');
    else toast.removeAttribute('data-toast-lift');
  }
}

function toastNextAction(text, tone) {
  const body = String(text || '');
  if (/请检查|后重试|后再试|可立即|请手动|可清除|可一键|可点|可继续|可打开|可到|或清除|或改用|可稍候|可再次/.test(body)) {
    return '';
  }
  if (tone === 'bad') return '请检查网络、权限或筛选条件后重试';
  if (tone === 'warn') return '可继续观察相关面板，必要时重试操作';
  return '可继续当前操作，或打开相关面板复核';
}

export function showToast(message, tone = 'good') {
  const toast = el('toast');
  if (!toast) return;
  const safeTone = ['good', 'warn', 'bad'].includes(tone) ? tone : 'good';
  const tonePrefix = { good: '成功提示：', warn: '注意：', bad: '错误：' }[safeTone];
  const text = String(message || '').trim() || '操作已完成';
  const nextAction = toastNextAction(text, safeTone);
  const ariaText = tonePrefix + text + (nextAction ? '。' + nextAction : '');
  syncToastLift();
  toast.className = 'toast ' + safeTone;
  toast.dataset.toastTone = safeTone;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-atomic', 'true');
  toast.setAttribute('aria-live', safeTone === 'bad' ? 'assertive' : 'polite');
  toast.setAttribute('aria-label', ariaText);
  toast.textContent = text;
  toast.hidden = false;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  // Bad toasts carry recovery next steps; keep them readable a bit longer.
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
    toast.hidden = true;
  }, safeTone === 'bad' ? 4800 : 3200);
}

/** Bare catch toasts: keep detail + add recovery next step when missing. */
export function showErrorToast(error, fallback = '操作未完成') {
  const detail = String((error && error.message) || error || '').trim();
  const base = detail || String(fallback || '操作未完成').trim() || '操作未完成';
  // Skip double recovery if the message already guides the next action.
  if (/请检查|后重试|后再试|可立即|请手动|可清除|可一键/.test(base)) {
    showToast(base, 'bad');
    return;
  }
  const sentence = /[。.!？?]$/.test(base) ? base : base + '。';
  showToast(sentence + '请检查网络、权限或筛选条件后重试。', 'bad');
}
