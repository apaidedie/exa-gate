import { loginToken, el } from '../state.js';
import { scheduleControlFocus } from '../ui/focus.js';

export function syncLoginTokenDescribedBy(hasError) {
  const capsHint = el('loginCapsHint');
  const capsVisible = capsHint && !capsHint.hidden;
  const parts = [];
  if (hasError) parts.push('loginError');
  if (capsVisible) parts.push('loginCapsHint');
  if (!parts.length) parts.push('loginCapsHint');
  loginToken.setAttribute('aria-describedby', parts.join(' '));
}

export function setLoginError(message = '') {
  const errorEl = el('loginError');
  if (!errorEl) return;
  const text = String(message || '').trim();
  const hasError = Boolean(text);
  errorEl.textContent = text;
  errorEl.hidden = !hasError;
  if (hasError) {
    errorEl.setAttribute('role', 'alert');
    errorEl.setAttribute('aria-live', 'assertive');
    errorEl.setAttribute('aria-atomic', 'true');
    const next = /demo|令牌|重试|检查|输入/.test(text)
      ? '请按提示修正后重新进入控制台'
      : '可重新输入管理员令牌，或填入 demo 令牌后重试';
    errorEl.setAttribute('aria-label', '登录错误：' + text + '。' + next);
    loginToken.setAttribute('aria-invalid', 'true');
  } else {
    errorEl.setAttribute('role', 'status');
    errorEl.setAttribute('aria-live', 'polite');
    errorEl.setAttribute('aria-atomic', 'true');
    errorEl.setAttribute('aria-label', '登录错误：暂无。可输入管理员令牌后进入控制台');
    loginToken.setAttribute('aria-invalid', 'false');
  }
  syncLoginTokenDescribedBy(hasError);
}

export function syncLoginCapsHint(event) {
  const hint = el('loginCapsHint');
  if (!hint) return;
  const enabled = Boolean(event?.getModifierState?.('CapsLock'));
  hint.hidden = !enabled;
  if (enabled) {
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.setAttribute('aria-atomic', 'true');
    hint.setAttribute('aria-label', 'Caps Lock 已开启。请确认令牌大小写后继续输入或登录');
    if (!hint.textContent?.trim()) hint.textContent = 'Caps Lock 已开启，注意令牌大小写。';
  } else {
    hint.setAttribute('aria-label', 'Caps Lock 未开启。可继续输入管理员令牌');
  }
  syncLoginTokenDescribedBy(Boolean(el('loginError')?.textContent?.trim()));
}

export function isSessionExpiredError(error) {
  return /登录已过期/.test(String(error?.message || ''));
}

/** Wire session shell transitions that depend on live/nav helpers owned by admin.js */
export function createSessionShell({ clearToken, closeEventStream, setLiveLinkStatus, switchTab, resetTimer, connectEventStream, state }) {
  function showLogin(message = '') {
    document.querySelector('[data-login-screen]').hidden = false;
    document.querySelector('[data-console-shell]').hidden = true;
    setLoginError(message);
    if (state.timer) clearInterval(state.timer);
    closeEventStream();
    setLiveLinkStatus('offline');
    scheduleControlFocus('loginToken');
  }

  function showConsole() {
    document.querySelector('[data-login-screen]').hidden = true;
    document.querySelector('[data-console-shell]').hidden = false;
    setLoginError('');
    switchTab(state.activeTab || 'keys');
    resetTimer();
    connectEventStream();
  }

  function forceSessionExpired(message = '登录已过期。请重新输入管理员令牌以继续运维操作。') {
    clearToken();
    closeEventStream();
    setLiveLinkStatus('offline');
    showLogin(message);
  }

  return { showLogin, showConsole, forceSessionExpired };
}
