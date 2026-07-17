import { api, clearToken, verifyAdminToken } from '../api.js';
import { el, loginToken } from '../state.js';
import { showErrorToast } from '../ui/toast.js';
import { setButtonPending } from '../ui/busy.js';
import { scheduleControlFocus } from '../ui/focus.js';
import { closeEventStream } from '../live/events.js';
import { setLoginError, syncLoginCapsHint, syncLoginTokenDescribedBy } from '../session/auth-ui.js';

export function bindSessionEvents(ctx) {
  const {
    refresh,
    resetTimer,
    showLogin,
    showConsole,
    switchTab,
    focusControlInTab,
    runOverviewAction,
    requestPruneLogsConfirm,
    testWebhook,
    focusConfigPosture,
    copyReadinessCommand,
    runExportLogs,
    runExportAudit,
    syncAutoRefreshAria,
    bindSidebarCollapse,
    updateBatchBar,
    clearBatchSelection,
    applyKeySort,
    requestBatchDisableConfirm,
    closeMobileDetailsPanel,
    openKeyDetailFromLog,
    runKeyWorkflowAction,
    batchKeyAction,
    keyAction,
    keyPagerMaxPage,
    goKeyPage,
    runKeyEmptyAction,
    openCommandPalette,
    closeCommandPalette,
    renderCommandPalette,
    handleCommandPaletteKeydown,
    trapCommandPaletteFocus,
    shouldIgnoreCommandShortcut,
    runCommand,
    visibleCommands,
    setActiveCommand,
    resetActiveCommandIndex
  } = ctx;

el('refresh').addEventListener('click', () => refresh().catch((error) => showErrorToast(error)));
if (el('retryRefresh')) el('retryRefresh').addEventListener('click', () => {
  const restore = setButtonPending(el('retryRefresh'), '正在重试');
  refresh({ force: true }).catch((error) => showErrorToast(error)).finally(restore);
});
el('testWebhook').addEventListener('click', () => testWebhook().catch((error) => showErrorToast(error)));
el('logout').addEventListener('click', () => { closeEventStream(); api('/_proxy/session', { method: 'DELETE' }).catch(() => {}).finally(() => { clearToken(); showLogin('已安全退出。重新输入管理员令牌即可再次进入控制台。'); }); });
el('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = loginToken.value.trim();
  if (!value) {
    setLoginError('请输入管理员令牌后再进入控制台。');
    scheduleControlFocus('loginToken');
    return;
  }
  setLoginError('');
  const loginButton = el('loginButton');
  loginButton.disabled = true;
  loginButton.textContent = '正在登录…';
  loginButton.setAttribute('aria-busy', 'true');
  loginButton.setAttribute('aria-label', '正在登录控制台。请稍候');
  try {
    await verifyAdminToken(value);
    showConsole();
    await refresh();
  } catch (error) {
    clearToken();
    showLogin(error.message || '登录失败。请检查管理员令牌或网络后重试。');
  } finally {
    loginButton.disabled = false;
    loginButton.removeAttribute('aria-busy');
    loginButton.setAttribute('aria-label', '使用管理员令牌进入控制台');
    loginButton.innerHTML = '<span class="login-submit-icon" aria-hidden="true"></span>进入控制台';
  }
});
el('toggleLoginToken').addEventListener('click', () => {
  const visible = loginToken.type === 'text';
  loginToken.type = visible ? 'password' : 'text';
  const toggle = el('toggleLoginToken');
  const nowVisible = loginToken.type === 'text';
  toggle.textContent = nowVisible ? '隐藏' : '显示';
  toggle.setAttribute(
    'aria-label',
    nowVisible
      ? '令牌可见性：已显示。点击切换为隐藏，可保护令牌后继续登录'
      : '令牌可见性：已隐藏。点击切换为显示，可核对令牌后继续登录'
  );
  toggle.setAttribute('aria-pressed', String(nowVisible));
});
loginToken.addEventListener('input', () => {
  if (el('loginError')?.textContent) setLoginError('');
});
loginToken.addEventListener('keydown', syncLoginCapsHint);
loginToken.addEventListener('keyup', syncLoginCapsHint);
loginToken.addEventListener('blur', () => {
  el('loginCapsHint').hidden = true;
  syncLoginTokenDescribedBy(Boolean(el('loginError')?.textContent?.trim()));
});
}
