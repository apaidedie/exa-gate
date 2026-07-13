import { api, clearToken, currentSessionId, exportAudit, exportLogs, fetchConfigSummary, fetchKeyFailureSummary, fetchLogTrace, fetchLogs, fetchObservability, verifyAdminToken, verifyStoredSession } from './api.js';
import { debounce, displayLabelById, el, esc, fmt, labelOf, loginToken, ms, rawKeyDisplayAllowed, stamp, state, token } from './state.js';
import { renderDetails, renderKeys, showKeyOnCurrentPage, syncSecretToggleState, syncSelectAllKeysControl, updateKeyWorkflowSelection, updateSummary } from './renderKeys.js';
import { renderAudit, renderLogTrace, renderLogs } from './renderLogs.js';
import { renderConfigSummary, renderObservability } from './renderObservability.js';

let toastTimer;
let refreshInFlight = null;
let importPending = false;
let importFocusReturn = null;
let confirmActionFocusReturn = null;
let pendingConfirmAction = null;
let commandPaletteFocusReturn = null;
let activeCommandIndex = 0;
let configPostureFocusTimer = null;
const refreshStatusCopy = {
  waiting: '待同步',
  syncing: '正在同步',
  updated: '已刷新 ',
  failed: '同步失败'
};
const refreshStatusAria = {
  waiting: '控制台同步：待首次同步。可点击刷新状态开始同步',
  syncing: '控制台同步：正在同步密钥与观测数据。请稍候',
  updated: '控制台同步：已刷新',
  failed: '控制台同步：同步失败。可点击立即重试或检查网络后继续'
};
const liveLinkCopy = {
  live: '实时在线',
  reconnecting: '正在重连',
  offline: '实时离线'
};
const liveLinkAria = {
  live: '实时链路：已连接，变更会自动推送。可继续观察控制台',
  reconnecting: '实时链路：连接中断，正在重连。可稍候或手动刷新控制台',
  offline: '实时链路：已断开。可点击刷新状态重新同步'
};
function refreshTimeLabel(value = Date.now()) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function syncToastLift() {
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

function showToast(message, tone = 'good') {
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
function showErrorToast(error, fallback = '操作未完成') {
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

function setRefreshStatus(status, detail = '') {
  const target = el('lastUpdated');
  if (!target) return;
  const safeStatus = Object.prototype.hasOwnProperty.call(refreshStatusCopy, status) ? status : 'waiting';
  target.setAttribute('data-refresh-state', safeStatus);
  target.setAttribute('role', 'status');
  target.className = 'refresh-status is-' + safeStatus;
  if (safeStatus === 'updated') {
    const refreshedAt = Date.now();
    const timeLabel = detail || refreshTimeLabel(refreshedAt);
    target.textContent = refreshStatusCopy.updated + timeLabel;
    target.title = '已刷新 ' + stamp(refreshedAt);
    target.setAttribute('aria-label', refreshStatusAria.updated + ' ' + timeLabel + '。可继续观察，或再次点击刷新状态');
  } else {
    const text = refreshStatusCopy[safeStatus] + (detail ? ' · ' + detail : '');
    target.textContent = text;
    target.title = text;
    target.setAttribute('aria-label', detail
      ? (refreshStatusAria[safeStatus] + ' · ' + detail + (safeStatus === 'failed' ? '' : '。可继续观察或手动刷新'))
      : (refreshStatusAria[safeStatus] || refreshStatusAria.waiting));
  }
  if (safeStatus === 'syncing') target.setAttribute('aria-busy', 'true');
  else target.removeAttribute('aria-busy');
  if (safeStatus === 'failed') setRefreshRecovery(true, detail);
  else if (safeStatus === 'updated' || safeStatus === 'syncing' || safeStatus === 'waiting') setRefreshRecovery(false);
}

function setRefreshRecovery(visible, detail = '') {
  const banner = el('refreshRecovery');
  if (!banner) return;
  banner.hidden = !visible;
  const recoveryText = detail
    ? ('最近同步失败：' + detail + '。可点击立即重试，或检查服务与网络后继续。')
    : '最近同步失败。可点击立即重试，或检查服务与网络后继续。';
  const text = el('refreshRecoveryText');
  if (text) {
    text.textContent = recoveryText;
    text.setAttribute('role', 'status');
    text.setAttribute('aria-live', 'assertive');
    text.setAttribute('aria-atomic', 'true');
    text.setAttribute('aria-label', '同步异常说明：' + recoveryText);
  }
  const title = el('refreshRecoveryTitle');
  if (title) {
    title.setAttribute('role', 'status');
    title.setAttribute('aria-live', 'assertive');
    title.setAttribute('aria-atomic', 'true');
    title.setAttribute('aria-label', '控制台刷新失败。可立即重试');
  }
  if (visible) {
    banner.setAttribute('aria-label', '控制台刷新失败恢复区。' + recoveryText);
  } else {
    banner.setAttribute('aria-label', '控制台刷新失败恢复区。同步正常时隐藏；失败时可立即重试');
  }
  const retry = el('retryRefresh');
  if (retry) {
    retry.setAttribute('aria-label', '立即重试控制台刷新，重新同步密钥与观测数据');
  }
  const status = el('lastUpdated');
  if (status) {
    if (visible) status.setAttribute('aria-describedby', 'refreshRecoveryText');
    else status.removeAttribute('aria-describedby');
  }
}

function setLiveLinkStatus(status) {
  const target = el('liveLinkStatus');
  if (!target) return;
  const safeStatus = Object.prototype.hasOwnProperty.call(liveLinkCopy, status) ? status : 'offline';
  target.setAttribute('data-live-state', safeStatus);
  target.setAttribute('role', 'status');
  target.setAttribute('aria-label', liveLinkAria[safeStatus] || liveLinkAria.offline);
  target.className = 'live-link-status is-' + safeStatus;
  target.textContent = liveLinkCopy[safeStatus];
  target.title = liveLinkCopy[safeStatus];
}

function isSessionExpiredError(error) {
  return /登录已过期/.test(String(error?.message || ''));
}

function forceSessionExpired(message = '登录已过期。请重新输入管理员令牌以继续运维操作。') {
  clearToken();
  closeEventStream();
  setLiveLinkStatus('offline');
  showLogin(message);
}

function setButtonPending(button, pendingText) {
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

function setButtonBusy(button) {
  if (!button) return () => {};
  const previousDisabled = button.disabled;
  const previousBusy = button.getAttribute('aria-busy');
  button.disabled = true;
  button.dataset.pending = 'true';
  button.setAttribute('aria-busy', 'true');
  return () => {
    button.disabled = previousDisabled;
    delete button.dataset.pending;
    if (previousBusy === null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', previousBusy);
  };
}

function updateLastUpdated() {
  setRefreshStatus('updated');
}

function updateBatchBar() {
  const bar = el('batchBar');
  const count = state.selectedKeyIds.length;
  const shell = document.querySelector('[data-console-shell]');
  if (bar) {
    bar.hidden = count === 0;
    const countEl = el('batchCount');
    if (countEl) {
      const summary = '已选 ' + fmt(count) + ' 个密钥';
      const hint = '批量操作会写入管理员审计';
      const nextAction = count
        ? '可测试/启用/禁用已选密钥，或清除选择'
        : '可在密钥池勾选密钥后使用批量操作';
      countEl.innerHTML = '<strong>' + summary + '</strong><small>' + hint + '</small>';
      countEl.setAttribute('role', 'status');
      countEl.setAttribute('aria-live', 'polite');
      countEl.setAttribute('aria-atomic', 'true');
      countEl.setAttribute('aria-label', count ? (summary + '，' + hint + '。' + nextAction) : ('尚未选择密钥。' + nextAction));
    }
  }
  if (shell) {
    if (count > 0) shell.setAttribute('data-batch-open', '');
    else shell.removeAttribute('data-batch-open');
  }
  syncSelectAllKeysControl();
  updateKeyWorkflowSelection();
  // Measure after layout so toast clearance matches stacked mobile batch bar.
  requestAnimationFrame(() => syncToastLift());
}

function clearBatchSelection() {
  if (!state.selectedKeyIds.length) {
    updateBatchBar();
    return;
  }
  state.selectedKeyIds = [];
  const selectAll = el('selectAllKeys');
  if (selectAll) selectAll.checked = false;
  renderKeys();
  updateBatchBar();
}

function applyKeySort(column) {
  if (!column) return;
  if (state.keySort.column === column) {
    state.keySort.direction = state.keySort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.keySort = { column, direction: 'asc' };
  }
  renderKeys();
}

let reconnectTimer;
function closeEventStream() {
  if (state.events) state.events.close();
  state.events = null;
  state.eventRefreshPending = false;
  clearTimeout(reconnectTimer);
}

function syncLoginTokenDescribedBy(hasError) {
  const capsHint = el('loginCapsHint');
  const capsVisible = capsHint && !capsHint.hidden;
  const parts = [];
  if (hasError) parts.push('loginError');
  if (capsVisible) parts.push('loginCapsHint');
  if (!parts.length) parts.push('loginCapsHint');
  loginToken.setAttribute('aria-describedby', parts.join(' '));
}

function setLoginError(message = '') {
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

function showLogin(message = '') {
  document.querySelector('[data-login-screen]').hidden = false;
  document.querySelector('[data-console-shell]').hidden = true;
  setLoginError(message);
  if (state.timer) clearInterval(state.timer);
  closeEventStream();
  setLiveLinkStatus('offline');
  loginToken.focus();
}

function showConsole() {
  document.querySelector('[data-login-screen]').hidden = true;
  document.querySelector('[data-console-shell]').hidden = false;
  setLoginError('');
  switchTab(state.activeTab || 'keys');
  resetTimer();
  connectEventStream();
}

function syncLoginCapsHint(event) {
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

async function pruneLogs() {
  const days = Number(state.observability?.retention?.days || 14);
  const button = el('pruneLogs');
  const restore = setButtonPending(button, '正在清理');
  try {
    const result = await api('/_proxy/logs/prune', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days }) });
    showToast('已清理 ' + fmt(result.deleted || 0) + ' 条过期日志。可到审计列表查看清理记录，或继续观察请求日志。');
    await refresh({ force: true });
  } finally {
    restore();
  }
}

function isConfirmActionOpen() {
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
  confirmActionFocusReturn = active instanceof HTMLElement && document.body.contains(active) ? active : null;
}

function restoreConfirmActionFocus() {
  if (confirmActionFocusReturn && confirmActionFocusReturn.isConnected && typeof confirmActionFocusReturn.focus === 'function') {
    confirmActionFocusReturn.focus();
  }
  confirmActionFocusReturn = null;
}

function trapConfirmActionFocus(event) {
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

function closeConfirmAction() {
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
    accept.setAttribute('aria-label', '确认执行危险操作。确认后会写入管理员审计');
    accept.textContent = '确认';
  }
  if (cancel) cancel.setAttribute('aria-label', '取消确认操作，返回控制台');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭确认对话框，返回控制台');
  restoreConfirmActionFocus();
}

function openConfirmAction(spec) {
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
  if (cancel) cancel.setAttribute('aria-label', '取消“' + titleText + '”，返回控制台不执行');
  const closeBtn = el('closeConfirmAction');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭“' + titleText + '”确认，返回控制台');
  modal.setAttribute('aria-label', '危险操作确认：' + titleText + '。' + bodyText + '。可确认执行或取消');
  modal.hidden = false;
  modal.classList.add('modal-open');
  if (cancel) cancel.focus();
  else accept.focus();
}

async function acceptConfirmAction() {
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

function requestPruneLogsConfirm() {
  const days = Number(state.observability?.retention?.days || 14);
  openConfirmAction({
    id: 'prune-logs',
    title: '清理过期日志',
    body: '将删除超过 ' + days + ' 天保留期的过期请求日志。仅清理过期记录，此操作会写入管理员审计。',
    acceptLabel: '确认清理',
    pendingLabel: '正在清理',
    run: () => pruneLogs()
  });
}

function requestBatchDisableConfirm(ids, source) {
  const picked = Array.from(new Set(ids || [])).filter(Boolean);
  if (!picked.length) {
    showToast('没有可批量处理的密钥。请先勾选密钥，或筛选异常项后再试。', 'warn');
    return;
  }
  const count = picked.length;
  const isProblems = source === 'problems';
  openConfirmAction({
    id: isProblems ? 'batch-disable-problems' : 'batch-disable-selected',
    title: isProblems ? '禁用异常密钥' : '批量禁用密钥',
    body: isProblems
      ? '将禁用当前列表中的 ' + count + ' 个异常密钥。禁用后这些密钥不再参与调度，操作会写入管理员审计。'
      : '将禁用已选中的 ' + count + ' 个密钥。禁用后这些密钥不再参与调度，操作会写入管理员审计。',
    acceptLabel: '确认禁用',
    pendingLabel: '正在禁用',
    run: () => batchKeyAction('disable', picked)
  });
}

async function testWebhook() {
  const button = el('testWebhook');
  const restore = setButtonPending(button, '正在测试');
  try {
    const result = await api('/_proxy/alerts/webhook/test', { method: 'POST' });
    const ok = Boolean(result.ok);
    showToast(ok ? 'Webhook 测试已发送。可到审计列表确认投递记录，或继续观察告警中心。' : 'Webhook 测试失败：' + (result.error || result.statusCode || '未知错误') + '。请检查 Webhook URL 与密钥配置后重试。', ok ? 'good' : 'bad');
    await refresh({ force: true });
  } catch (error) {
    showToast('Webhook 测试失败：' + (error.message || '未知错误') + '。请检查 Webhook URL 与网络后重试。', 'bad');
  } finally {
    restore();
  }
}

async function loadKeyFailureSummary(id) {
  if (!id) return;
  const result = await fetchKeyFailureSummary(id);
  state.keyFailures[id] = result.summary;
}

async function loadLogTrace(requestId) {
  const result = await fetchLogTrace(requestId);
  state.trace = result;
  renderLogTrace();
}

async function reloadLogs(options = {}) {
  const restore = options.button ? setButtonPending(options.button, options.pendingText || '正在筛选') : () => {};
  try {
    const data = await fetchLogs();
    state.logs = data.logs || [];
    renderLogs();
    if (!state.trace?.requestId) renderLogTrace();
  } finally {
    restore();
  }
}

async function applyLogStatusFilter(status, { focus = false, toast = '' } = {}) {
  el('logStatusFilter').value = status;
  state.trace = null;
  renderLogTrace();
  await reloadLogs();
  if (focus) {
    requestAnimationFrame(() => el('logStatusFilter').focus());
  }
  if (toast) showToast(toast);
}

async function applyLogKeyFilter(keyId, { focus = false, toast = '' } = {}) {
  el('logKeyFilter').value = keyId;
  state.trace = null;
  renderLogTrace();
  await reloadLogs();
  if (focus) {
    requestAnimationFrame(() => {
      const input = el('logKeyFilter');
      input.focus();
      input.select?.();
    });
  }
  if (toast) showToast(toast);
}

async function clearLogFilters() {
  el('logSearch').value = '';
  el('logPathFilter').value = '';
  el('logKeyFilter').value = '';
  el('logStatusFilter').value = '';
  state.trace = null;
  renderLogTrace();
  await reloadLogs({ button: el('clearLogFilters'), pendingText: '正在清除' });
  showToast('日志筛选已清除。可继续搜索 requestId，或按路径/状态收窄。');
}

async function removeLogFilterDimension(dimension) {
  const labels = { query: '关键词', path: '路径', key: '密钥', status: '状态' };
  if (dimension === 'query') el('logSearch').value = '';
  else if (dimension === 'path') el('logPathFilter').value = '';
  else if (dimension === 'key') el('logKeyFilter').value = '';
  else if (dimension === 'status') el('logStatusFilter').value = '';
  else return;
  if (dimension === 'query') {
    renderLogs();
  } else {
    await reloadLogs();
  }
  showToast('已移除' + (labels[dimension] || '') + '筛选。可继续调整其他条件或刷新列表。');
}

async function runLogDiagnosticAction(button) {
  const action = button?.dataset?.logDiagnosticAction || '';
  if (!action || button.disabled) return;
  const restore = setButtonBusy(button);
  try {
    if (action === 'reset') {
      await clearLogFilters();
      return;
    }
    if (action === 'errors') {
      await applyLogStatusFilter('error', { toast: '已筛选异常请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' });
      return;
    }
    if (action === 'rate-limit') {
      await applyLogStatusFilter('429', { toast: '已筛选 429 请求日志。可继续按路径收窄，或清除筛选恢复全部。' });
      return;
    }
    if (action === 'slowest') {
      const pathValue = button.dataset.logDiagnosticValue || '';
      if (!pathValue) {
        showToast('暂无最慢请求样本。请等待新请求写入日志后再试。', 'warn');
        return;
      }
      el('logPathFilter').value = pathValue;
      await reloadLogs();
      requestAnimationFrame(() => {
        const pathInput = el('logPathFilter');
        pathInput.focus();
        pathInput.select?.();
      });
      showToast('已按最慢请求路径筛选日志。可点 requestId 查看链路，或清除筛选恢复全部。');
    }
  } finally {
    restore();
    renderLogs();
  }
}

function clearKeyFilters() {
  el('keySearch').value = '';
  state.keyFilter = 'All';
  state.keyPage = 1;
  renderKeys();
  showToast('密钥筛选已清除。可继续搜索 ID，或按状态筛选健康/异常项。');
}

function removeKeyFilterDimension(dimension) {
  if (dimension === 'query') {
    el('keySearch').value = '';
  } else if (dimension === 'status') {
    state.keyFilter = 'All';
  } else {
    return;
  }
  state.keyPage = 1;
  renderKeys();
  showToast(dimension === 'query' ? '已移除关键词筛选。可继续按状态筛选或搜索其他 ID。' : '已移除状态筛选。可继续搜索关键词或查看全部密钥。');
}

function focusKeyFilterChip(chipName) {
  requestAnimationFrame(() => {
    const chip = document.querySelector('#keyFilterChips .chip[data-chip="' + chipName + '"]');
    if (chip instanceof HTMLElement) chip.focus();
  });
}

function applyProblemKeyFilter() {
  state.keyFilter = 'Problem';
  state.keyPage = 1;
  renderKeys();
  focusKeyFilterChip('Problem');
}

async function openKeyDetailFromLog(id) {
  const key = state.keys.find((item) => item.id === id);
  if (!key) {
    showToast('该日志关联的密钥不在当前密钥池。可清除密钥筛选，或到密钥池搜索该 ID。', 'warn');
    return;
  }
  el('keySearch').value = '';
  state.keyFilter = 'All';
  state.selectedId = id;
  state.mobileDetailsOpen = true;
  state.detailFocusAction = 'logs';
  state.detailFocusUntil = Date.now() + 1600;
  showKeyOnCurrentPage(id);
  switchTab('keys');
  await loadKeyFailureSummary(id).catch(() => {});
  state.lastOperation = { id, tone: 'good', title: '日志定位', message: '已从请求日志打开密钥 ' + displayLabelById(id) + ' 的详情。可继续查看健康、冷却和最近失败。', time: stamp(Date.now()) };
  renderKeys();
  renderDetails();
  scrollMobileDetailsIntoView();
  focusDetailLogAction();
  requestAnimationFrame(focusDetailLogAction);
  showToast('已从日志打开密钥详情。可查看健康/冷却，或返回日志继续定位。');
}

function runKeyWorkflowAction(button) {
  const action = button?.dataset?.keyWorkflowAction || '';
  if (!action || button.disabled) return;
  const restore = setButtonBusy(button);
  try {
    if (action === 'reset') {
      const wasFiltered = Boolean(el('keySearch').value.trim()) || state.keyFilter !== 'All';
      clearKeyFilters();
      focusKeyFilterChip('All');
      if (!wasFiltered) showToast('已聚焦全部密钥范围。可继续搜索 ID，或按状态筛选。');
      return;
    }
    if (action === 'selected') {
      const firstAction = el('batchTestSelected') || el('batchEnableSelected') || el('batchBar');
      if (firstAction && typeof firstAction.focus === 'function') {
        requestAnimationFrame(() => firstAction.focus());
      }
      showToast('已聚焦已选密钥的批量操作。可测试/启用/禁用，或清除选择。');
      return;
    }
    if (action === 'problems') {
      applyProblemKeyFilter();
      showToast('已筛选异常密钥。可批量测试/禁用，或清除筛选恢复全部。');
      return;
    }
    if (action === 'scope') {
      requestAnimationFrame(() => {
        const search = el('keySearch');
        search.focus();
        search.select?.();
      });
      showToast('已聚焦密钥搜索。可输入 ID 或标签，Enter 后查看匹配项。');
    }
  } finally {
    restore();
  }
}

async function reloadAudit(options = {}) {
  const restore = options.button ? setButtonPending(options.button, options.pendingText || '正在刷新') : () => {};
  try {
    const auditData = await api('/_proxy/audit?limit=12');
    state.audit = auditData.audit || [];
    renderAudit();
  } finally {
    restore();
  }
}

function clearAuditFilters() {
  el('auditSearch').value = '';
  el('auditActionFilter').value = '';
  el('auditOutcomeFilter').value = '';
  renderAudit();
  showToast('审计筛选已清除。可继续搜索关键词，或按动作/结果收窄。');
}

function removeAuditFilterDimension(dimension) {
  const labels = { query: '关键词', action: '动作', outcome: '结果' };
  if (dimension === 'query') el('auditSearch').value = '';
  else if (dimension === 'action') el('auditActionFilter').value = '';
  else if (dimension === 'outcome') el('auditOutcomeFilter').value = '';
  else return;
  renderAudit();
  showToast('已移除' + (labels[dimension] || '') + '筛选。可继续调整其他条件或导出证据。');
}

function focusAuditSearch({ select = false } = {}) {
  requestAnimationFrame(() => {
    const search = el('auditSearch');
    search.focus();
    if (select) search.select?.();
  });
}

function focusAuditOutcomeFilter() {
  requestAnimationFrame(() => el('auditOutcomeFilter').focus());
}

async function runAuditEvidenceAction(button) {
  const action = button?.dataset?.auditEvidenceAction || '';
  if (!action || button.disabled) return;
  const restore = setButtonBusy(button);
  try {
    if (action === 'reset') {
      const wasFiltered = Boolean(el('auditSearch').value.trim()) || Boolean(el('auditActionFilter').value) || Boolean(el('auditOutcomeFilter').value);
      clearAuditFilters();
      focusAuditSearch({ select: true });
      if (!wasFiltered) showToast('已聚焦审计搜索。可输入动作/密钥 ID，或按结果筛选失败项。');
      return;
    }
    if (action === 'failures') {
      el('auditOutcomeFilter').value = 'failure';
      renderAudit();
      focusAuditOutcomeFilter();
      showToast('已筛选失败审计记录。可点条目复核，或清除筛选恢复全部。');
      return;
    }
    if (action === 'latest') {
      const value = button.dataset.auditEvidenceValue || '';
      if (!value) {
        showToast('暂无最新审计线索。请完成一次管理操作或刷新审计列表后再试。', 'warn');
        return;
      }
      el('auditSearch').value = value;
      renderAudit();
      focusAuditSearch({ select: true });
      showToast('已按最新审计线索搜索。可继续按动作/结果收窄，或清除筛选。');
      return;
    }
    if (action === 'export') {
      await exportAudit();
      showToast('审计证据导出已开始。可在下载目录打开 CSV，或继续筛选审计证据。');
    }
  } finally {
    restore();
    renderAudit();
  }
}

const configPostureTargets = {
  https: { id: 'configDetailHttps', label: '登录保护' },
  'raw-key': { id: 'configDetailRawKey', label: '密钥安全' },
  paths: { id: 'configDetailPaths', label: '路径策略' },
  state: { id: 'configDetailState', label: '状态存储' }
};

function focusConfigPosture(action) {
  const targetInfo = configPostureTargets[action];
  if (!targetInfo) return;
  if (state.activeTab !== 'audit') switchTab('audit');
  requestAnimationFrame(() => {
    const target = el(targetInfo.id);
    if (!target) return;
    document.querySelectorAll('[data-config-posture-target]').forEach((item) => delete item.dataset.configFocus);
    target.dataset.configFocus = 'true';
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
    clearTimeout(configPostureFocusTimer);
    configPostureFocusTimer = setTimeout(() => {
      if (target.isConnected) delete target.dataset.configFocus;
    }, 2400);
    showToast('已定位' + targetInfo.label + '配置详情。可对照建议调整，或导出审计证据。');
  });
}

function focusDetailLogAction() {
  state.detailFocusAction = 'logs';
  state.detailFocusUntil = Date.now() + 1600;
  const detailRoot = window.getComputedStyle(el('mobileDetails')).display === 'none' ? el('detailsBody') : el('mobileDetailsBody');
  const focusTarget = detailRoot?.querySelector('button[data-detail-action="logs"]') || detailRoot?.querySelector('button[data-detail-action]') || detailRoot;
  if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
}

async function copyReadinessCommand(button) {
  const card = button.closest('[data-readiness-command]');
  const command = card?.querySelector('.readiness-command-code')?.textContent?.trim() || '';
  if (!command) {
    showToast('未找到可复制的命令。请刷新上线检查，或手动对照配置项。', 'bad');
    return;
  }
  if (!navigator.clipboard?.writeText) {
    showToast('命令复制失败，请手动选中命令文本复制。', 'bad');
    return;
  }
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = '正在复制';
  try {
    await navigator.clipboard.writeText(command);
    showToast('命令已复制。可粘贴到终端执行，或返回上线检查继续核对。');
  } catch {
    showToast('命令复制失败，请手动选中命令文本复制。', 'bad');
  } finally {
    button.disabled = false;
    button.textContent = previous || '复制';
  }
}

function scrollMobileDetailsIntoView() {
  const panel = el('mobileDetails');
  if (!panel || window.getComputedStyle(panel).display === 'none') return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
}

function closeMobileDetailsPanel() {
  state.mobileDetailsOpen = false;
  const panel = el('mobileDetails');
  if (panel) {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-label', '移动端密钥详情。选择密钥后可在此查看');
  }
  const closeBtn = el('closeMobileDetails');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭移动端密钥详情，返回密钥表');
  // Return keyboard focus to the table row that opened the panel (or a nearby keys control).
  requestAnimationFrame(() => {
    const body = el('keysBody');
    const selectedId = state.selectedId;
    const row = selectedId && body
      ? Array.from(body.querySelectorAll('tr[data-key-id]')).find((item) => item.dataset.keyId === selectedId)
      : null;
    const rowSelect = row?.querySelector('button[data-action="select"]');
    const fallback = el('keySearch') || document.querySelector('#keyFilterChips .chip');
    const target = rowSelect || fallback;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  });
}

function syncTableScrollAffordance(scroller) {
  if (!scroller) return;
  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
  const hasOverflow = maxScrollLeft > 1;
  const atStart = !hasOverflow || scroller.scrollLeft <= 1;
  const atEnd = !hasOverflow || scroller.scrollLeft >= maxScrollLeft - 1;
  scroller.dataset.overflowX = String(hasOverflow);
  scroller.dataset.scrollStart = String(atStart);
  scroller.dataset.scrollEnd = String(atEnd);
}

function syncTableScrollAffordances() {
  document.querySelectorAll('.table-scroll').forEach(syncTableScrollAffordance);
}

function switchTab(tabId) {
  state.activeTab = tabId;
  const tabMeta = {
    overview: { label: '概览', next: '可查看运行态势、趋势与告警' },
    keys: { label: '密钥池', next: '可管理密钥、筛选并批量操作' },
    logs: { label: '请求日志', next: '可筛选请求并查看链路' },
    audit: { label: '审计与配置', next: '可复核审计证据与上线配置' }
  };
  document.querySelectorAll('[data-tab-nav] .nav-item[data-tab]').forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    const meta = tabMeta[btn.dataset.tab] || { label: btn.dataset.tab || '页面', next: '可继续浏览控制台' };
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute(
      'aria-label',
      isActive
        ? ('当前页面：' + meta.label + '。' + meta.next)
        : ('切换到' + meta.label + '。' + meta.next)
    );
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === tabId));
  const shell = document.querySelector('[data-console-shell]');
  if (shell) shell.classList.toggle('has-aside', tabId === 'keys');
  renderActiveTab(tabId);
}

function renderActiveTab(tabId) {
  if (tabId === 'overview') {
    updateSummary();
    renderObservability();
  } else if (tabId === 'keys') {
    renderKeys();
    renderDetails();
  } else if (tabId === 'logs') {
    renderLogs();
    renderLogTrace();
  } else if (tabId === 'audit') {
    renderAudit();
    renderConfigSummary();
  }
  requestAnimationFrame(syncTableScrollAffordances);
}

const commandDefinitions = [
  { id: 'nav-overview', group: '导航', title: '打开概览', description: '查看运行洞察、趋势和告警', chip: '概览', aliases: 'overview dashboard status 运行 概览 趋势 告警', run: () => switchToCommandTab('overview') },
  { id: 'nav-keys', group: '导航', title: '打开密钥池', description: '管理 Key、批量操作和冷却状态', chip: '密钥', aliases: 'keys key pool 密钥 key 池', run: () => switchToCommandTab('keys') },
  { id: 'nav-logs', group: '导航', title: '打开请求日志', description: '查看请求、状态码和链路诊断', chip: '日志', aliases: 'logs request trace 请求 日志 链路', run: () => switchToCommandTab('logs') },
  { id: 'nav-audit', group: '导航', title: '打开审计与配置', description: '查看管理员审计和运行配置', chip: '审计', aliases: 'audit config governance 审计 配置 治理', run: () => switchToCommandTab('audit') },
  { id: 'focus-key-search', group: '筛选', title: '搜索密钥', description: '跳转到密钥池并聚焦搜索框', chip: '焦点', aliases: 'keys search filter key 密钥 搜索 筛选', run: () => focusControlInTab('keys', 'keySearch') },
  { id: 'focus-log-search', group: '筛选', title: '搜索请求日志', description: '跳转到请求日志并聚焦关键词搜索', chip: '焦点', aliases: 'logs search filter request 日志 搜索 筛选', run: () => focusControlInTab('logs', 'logSearch') },
  { id: 'focus-audit-search', group: '筛选', title: '搜索审计记录', description: '跳转到审计列表并聚焦搜索框', chip: '焦点', aliases: 'audit search filter 审计 搜索 筛选', run: () => focusControlInTab('audit', 'auditSearch') },
  { id: 'clear-key-filters', group: '筛选', title: '清除密钥筛选', description: '恢复全部密钥和第一页', chip: '清除', aliases: 'clear reset keys filters 清除 重置 密钥 筛选', run: () => { switchTab('keys'); clearKeyFilters(); } },
  { id: 'clear-log-filters', group: '筛选', title: '清除日志筛选', description: '恢复最近请求日志并清空链路选择', chip: '清除', aliases: 'clear reset logs filters 清除 重置 日志 筛选', run: () => { switchTab('logs'); clearLogFilters().catch((error) => showErrorToast(error)); } },
  { id: 'clear-audit-filters', group: '筛选', title: '清除审计筛选', description: '恢复最近管理员审计列表', chip: '清除', aliases: 'clear reset audit filters 清除 重置 审计 筛选', run: () => { switchTab('audit'); clearAuditFilters(); } },
  { id: 'import-keys', group: '操作', title: '批量导入密钥', description: '打开导入预检面板', chip: '导入', aliases: 'import keys upload 导入 密钥 批量', run: () => { switchTab('keys'); el('bulkImportBtn').focus(); openImportModal(); } },
  { id: 'refresh-console', group: '操作', title: '刷新控制台', description: '重新同步密钥、日志、审计和配置', chip: '刷新', aliases: 'refresh sync reload 刷新 同步', run: () => el('refresh').click() },
  { id: 'refresh-logs-list', group: '操作', title: '刷新请求日志列表', description: '重新载入当前筛选范围的请求日志窗口', chip: '刷新', aliases: 'refresh logs list reload 刷新 日志 列表', run: () => { switchTab('logs'); el('applyLogFilters').click(); } },
  { id: 'refresh-audit-list', group: '操作', title: '刷新审计列表', description: '重新载入最近管理员审计窗口', chip: '刷新', aliases: 'refresh audit list reload 刷新 审计 列表', run: () => { switchTab('audit'); el('refreshAuditList').click(); } },
  { id: 'test-webhook', group: '操作', title: '测试 Webhook', description: '发送一次告警 Webhook 探测', chip: '测试', aliases: 'webhook alert test 告警 测试', run: () => el('testWebhook').click() },
  { id: 'export-logs', group: '导出', title: '导出请求日志', description: '下载当前日志筛选范围 CSV', chip: 'CSV', aliases: 'export logs csv download 导出 日志', run: () => { switchTab('logs'); el('exportLogs').click(); } },
  { id: 'export-audit', group: '导出', title: '导出审计记录', description: '下载当前审计动作和结果范围 CSV', chip: 'CSV', aliases: 'export audit csv download 导出 审计', run: () => { switchTab('audit'); el('exportAudit').click(); } }
];

function focusActiveTabControl(tabId) {
  const controls = Array.from(document.querySelectorAll('[data-tab-nav] .nav-item[data-tab="' + tabId + '"]'));
  const visibleControl = controls.find((control) => control.offsetParent !== null);
  if (visibleControl && typeof visibleControl.focus === 'function') visibleControl.focus();
}

function switchToCommandTab(tabId) {
  switchTab(tabId);
  focusActiveTabControl(tabId);
}

function focusControlInTab(tabId, controlId) {
  switchTab(tabId);
  requestAnimationFrame(() => {
    const control = el(controlId);
    if (control && typeof control.focus === 'function') control.focus();
  });
}

function focusAlertTarget() {
  // Keep intent across SSE/refresh re-renders that replace #alertList buttons.
  state.alertFocusUntil = Date.now() + 1200;
  const applyFocus = () => {
    if (Date.now() > Number(state.alertFocusUntil || 0)) return;
    if (state.activeTab !== 'overview') return;
    const alertTarget = document.querySelector('#alertList button[data-overview-signal-action="alert-focus"]') || el('insightNextActionButton') || el('alertList');
    if (alertTarget && typeof alertTarget.focus === 'function') alertTarget.focus({ preventScroll: true });
  };
  requestAnimationFrame(applyFocus);
  window.setTimeout(applyFocus, 80);
  window.setTimeout(applyFocus, 400);
}

async function runOverviewAction(actionId, sourceButton = null) {
  if (!actionId || sourceButton?.disabled) return;
  const shouldMarkBusy = sourceButton && !sourceButton.dataset.overviewSignalAction && actionId !== 'import-keys';
  const restore = shouldMarkBusy ? setButtonBusy(sourceButton) : () => {};
  try {
    if (actionId === 'import-keys') {
      switchTab('keys');
      requestAnimationFrame(() => {
        el('bulkImportBtn').focus();
        openImportModal();
      });
      return;
    }
    if (actionId === 'keys') {
      focusControlInTab('keys', 'keySearch');
      showToast('已打开密钥池。可搜索 ID，或筛选健康/异常状态。');
      return;
    }
    if (actionId === 'keys-problem') {
      switchTab('keys');
      applyProblemKeyFilter();
      showToast('已筛选异常密钥。可批量测试/禁用，或清除筛选恢复全部。');
      return;
    }
    if (actionId === 'logs-focus') {
      focusControlInTab('logs', 'logSearch');
      showToast('已打开请求日志。可搜索 requestId，或按路径/状态筛选。');
      return;
    }
    if (actionId === 'log-errors') {
      switchTab('logs');
      await applyLogStatusFilter('error', { focus: true, toast: '已筛选异常请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' });
      return;
    }
    if (actionId === 'log-rate-limit') {
      switchTab('logs');
      await applyLogStatusFilter('429', { focus: true, toast: '已筛选 429 请求日志。可继续按路径收窄，或清除筛选恢复全部。' });
      return;
    }
    if (actionId === 'alert-focus') {
      focusAlertTarget();
      showToast('已聚焦告警建议。可按提示处理，或切换到密钥池/日志复核。');
      return;
    }
    if (actionId === 'trend-focus') {
      focusControlInTab('overview', 'timeRange');
      showToast('已聚焦观测窗口。可切换 1 小时/24 小时/7 天对比趋势。');
    }
  } finally {
    restore();
  }
}

function commandSearchText(command) {
  return [command.title, command.group, command.description, command.chip, command.aliases].join(' ').toLowerCase();
}

function visibleCommands() {
  const query = el('commandSearch')?.value?.trim().toLowerCase() || '';
  if (!query) return commandDefinitions;
  return commandDefinitions.filter((command) => commandSearchText(command).includes(query));
}

function commandGroupsFor(commands) {
  return [...new Set(commands.map((command) => command.group))];
}

function syncCommandPaletteContext(commands) {
  const groups = commandGroupsFor(commands);
  const query = el('commandSearch')?.value?.trim() || '';
  const groupText = groups.length ? groups.join(' · ') : '无匹配';
  const scopeText = query ? '关键词 “' + query + '”' : '全部命令';
  const resultText = fmt(commands.length) + ' / ' + fmt(commandDefinitions.length);
  const nextAction = commands.length
    ? (query ? '可用方向键选择并按 Enter 执行' : '可搜索命令，或方向键选择后按 Enter 执行')
    : '可清空搜索恢复全部命令，或改用密钥、日志、审计等词重试';
  el('commandResultCount').textContent = resultText;
  el('commandResultCount').setAttribute('aria-label', '匹配命令：' + resultText + '。' + nextAction);
  el('commandGroupCount').textContent = groupText;
  el('commandGroupCount').title = groupText;
  el('commandGroupCount').setAttribute('aria-label', '可用分组：' + groupText + '。' + nextAction);
  el('commandSearchScope').textContent = scopeText;
  el('commandSearchScope').title = scopeText;
  el('commandSearchScope').setAttribute('aria-label', '搜索范围：' + scopeText + '。' + nextAction);
  const context = el('commandPaletteContext');
  if (context) {
    context.setAttribute(
      'aria-label',
      '快速操作范围：匹配 ' + resultText + '，分组 ' + groupText + '，范围 ' + scopeText + '。' + nextAction
    );
  }
  const list = el('commandList');
  if (list) {
    list.setAttribute(
      'aria-label',
      commands.length
        ? ('快速操作列表：' + resultText + '。' + nextAction)
        : ('快速操作列表：无匹配。' + nextAction)
    );
  }
}

function setActiveCommand(index, commands = visibleCommands()) {
  activeCommandIndex = Math.max(0, Math.min(index, Math.max(0, commands.length - 1)));
  document.querySelectorAll('.command-option').forEach((button, itemIndex) => {
    const active = itemIndex === activeCommandIndex;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    if (active) el('commandSearch').setAttribute('aria-activedescendant', button.id);
  });
}

function renderCommandPalette() {
  const list = el('commandList');
  const empty = el('commandEmpty');
  const commands = visibleCommands();
  syncCommandPaletteContext(commands);
  if (!commands.length) {
    list.hidden = true;
    list.innerHTML = '';
    empty.hidden = false;
    el('commandSearch').setAttribute('aria-activedescendant', '');
    return;
  }
  list.hidden = false;
  empty.hidden = true;
  let optionIndex = 0;
  const groups = [];
  for (const command of commands) {
    let group = groups.find((item) => item.name === command.group);
    if (!group) {
      group = { name: command.group, commands: [] };
      groups.push(group);
    }
    group.commands.push(command);
  }
  list.innerHTML = groups.map((group) => '<div class="command-group"><span class="command-group-label">' + esc(group.name) + '</span>' + group.commands.map((command) => {
    const index = optionIndex;
    optionIndex += 1;
    const actionText = command.group + ' · ' + command.chip;
    return '<button id="commandOption-' + esc(command.id) + '" class="command-option" type="button" role="option" aria-selected="false" data-command-index="' + index + '" data-command-id="' + esc(command.id) + '"><span class="command-option-main"><span class="command-option-title">' + esc(command.title) + '</span><span class="command-option-desc">' + esc(command.description) + '</span><span class="command-option-meta"><span>' + esc(command.group) + '</span><em>' + esc(command.chip) + '</em></span></span><span class="command-option-chip" aria-label="命令类型：' + esc(actionText) + '。可方向键选择后按 Enter 执行" title="' + esc(actionText) + '">' + esc(command.chip) + '</span></button>';
  }).join('') + '</div>').join('');
  setActiveCommand(Math.min(activeCommandIndex, commands.length - 1), commands);
}

function focusableCommandControls() {
  return Array.from(el('commandPalette').querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'))
    .filter((control) => !control.disabled && !control.hidden && control.offsetParent !== null);
}

function openCommandPalette(opener = document.activeElement) {
  const palette = el('commandPalette');
  if (document.querySelector('[data-console-shell]')?.hidden) return;
  if (!palette.hidden) return;
  commandPaletteFocusReturn = opener instanceof HTMLElement && document.body.contains(opener) ? opener : null;
  el('commandSearch').value = '';
  activeCommandIndex = 0;
  renderCommandPalette();
  palette.hidden = false;
  palette.classList.add('is-open');
  const openBtn = el('openCommandPalette');
  if (openBtn) {
    openBtn.setAttribute('aria-expanded', 'true');
    openBtn.setAttribute('aria-label', '快速操作已打开。可搜索命令，或按 Esc 关闭');
  }
  const closeBtn = el('closeCommandPalette');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭快速操作，返回控制台');
  el('commandSearch').focus();
}

function closeCommandPalette({ restoreFocus = true } = {}) {
  const palette = el('commandPalette');
  if (palette.hidden) return;
  palette.classList.remove('is-open');
  palette.hidden = true;
  const openBtn = el('openCommandPalette');
  if (openBtn) {
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.setAttribute('aria-label', '打开快速操作（Ctrl K 或 Cmd K）');
  }
  const closeBtn = el('closeCommandPalette');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭快速操作，返回控制台');
  el('commandSearch').setAttribute('aria-activedescendant', '');
  if (restoreFocus && commandPaletteFocusReturn?.isConnected && typeof commandPaletteFocusReturn.focus === 'function') commandPaletteFocusReturn.focus();
  commandPaletteFocusReturn = null;
}

function runCommand(command) {
  if (!command) return;
  closeCommandPalette({ restoreFocus: false });
  command.run();
}

function runActiveCommand() {
  const commands = visibleCommands();
  runCommand(commands[activeCommandIndex]);
}

function trapCommandPaletteFocus(event) {
  if (event.key !== 'Tab' || el('commandPalette').hidden) return;
  const controls = focusableCommandControls();
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

function handleCommandPaletteKeydown(event) {
  if (el('commandPalette').hidden) return;
  const commands = visibleCommands();
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setActiveCommand(activeCommandIndex + 1, commands);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setActiveCommand(activeCommandIndex - 1, commands);
  } else if (event.key === 'Enter') {
    if (event.target instanceof HTMLElement && event.target.id === 'closeCommandPalette') return;
    event.preventDefault();
    if (event.target instanceof HTMLElement && event.target.matches('.command-option')) {
      runCommand(commands[Number(event.target.dataset.commandIndex)]);
      return;
    }
    runActiveCommand();
  }
}

function shouldIgnoreCommandShortcut(event) {
  if (document.querySelector('[data-console-shell]')?.hidden) return true;
  if (el('importModal').classList.contains('modal-open')) return true;
  if (isConfirmActionOpen()) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

async function refresh(options = {}) {
  if (refreshInFlight) {
    if (!options.force) return refreshInFlight;
    await refreshInFlight.catch(() => {});
  }
  const refreshButton = el('refresh');
  const restoreRefresh = setButtonPending(refreshButton, '正在刷新');
  setRefreshStatus('syncing');
  refreshInFlight = (async () => {
    try {
      const [keyData, logData, observabilityData, auditData, configData] = await Promise.all([
        api('/_proxy/keys'),
        fetchLogs(),
        fetchObservability(),
        api('/_proxy/audit?limit=12'),
        fetchConfigSummary()
      ]);
      state.keys = keyData.keys || [];
      state.logs = logData.logs || [];
      state.observability = observabilityData;
      state.audit = auditData.audit || [];
      state.config = configData || null;
      updateSummary();
      renderActiveTab(state.activeTab);
      if (state.activeTab === 'keys' && state.selectedId) await loadKeyFailureSummary(state.selectedId).catch(() => {});
      if (state.activeTab === 'keys') renderDetails();
      updateLastUpdated();
    } catch (error) {
      if (isSessionExpiredError(error)) {
        forceSessionExpired(error.message);
        throw error;
      }
      setRefreshStatus('failed', '可点刷新重试');
      throw error;
    } finally {
      restoreRefresh();
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function batchKeyAction(action, ids) {
  const picked = Array.from(new Set(ids || [])).filter(Boolean);
  if (!picked.length) { showToast('没有可批量处理的密钥。请先勾选密钥，或筛选异常项后再试。', 'warn'); return; }
  const actionLabel = { enable: '正在启用', disable: '正在禁用', reset: '正在重置', test: '正在测试' }[action] || '处理中';
  const pendingButtons = Array.from(document.querySelectorAll('[id^="batch"], #batchTestPage, #batchDisableProblems'))
    .filter((button) => button instanceof HTMLButtonElement && !button.disabled)
    .map((button) => setButtonPending(button, actionLabel));
  try {
    const result = await api('/_proxy/keys/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ids: picked }) });
    showToast('批量操作完成：' + fmt((result.results || []).length) + ' 个密钥。可继续筛选状态或打开详情复核。');
    await refresh({ force: true });
  } finally {
    pendingButtons.forEach((restore) => restore());
  }
}

async function keyAction(id, action, sourceButton = null) {
  if (action === 'toggle') {
    const key = state.keys.find((item) => item.id === id);
    action = key && key.enabled ? 'disable' : 'enable';
  }
  state.selectedId = id;
  if (['select', 'copy', 'reset', 'test', 'enable', 'disable', 'logs'].includes(action)) state.mobileDetailsOpen = true;
  if (action === 'select') {
    await loadKeyFailureSummary(id).catch(() => {});
    state.lastOperation = { id, tone: 'good', title: '详情', message: '已打开密钥 ' + displayLabelById(id) + ' 的详情。详情面板已同步显示用量、冷却和最后错误。', time: stamp(Date.now()) };
    renderDetails();
    scrollMobileDetailsIntoView();
    showToast('已打开密钥 ' + displayLabelById(id) + ' 详情。可测试/重置冷却，或查看关联请求日志。');
    return;
  }
  if (action === 'logs') {
    switchTab('logs');
    await applyLogKeyFilter(id, { focus: true, toast: '已按密钥筛选请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' });
    return;
  }
  const pendingLabel = { test: '正在测试', reset: '正在重置', enable: '正在启用', disable: '正在禁用', copy: '正在复制' }[action];
  const restore = pendingLabel && sourceButton instanceof HTMLButtonElement
    ? setButtonPending(sourceButton, pendingLabel)
    : () => {};
  // After re-render/refresh, restore keyboard focus near the control the operator used.
  // Row mini-buttons are replaced with tbody rebuild; detail buttons use data-detail-action.
  // enable/disable flip the detail toggle's data-detail-action after the action completes.
  const isRowActionButton = sourceButton instanceof HTMLButtonElement
    && sourceButton.hasAttribute('data-action')
    && !sourceButton.hasAttribute('data-detail-action');
  if (isRowActionButton) {
    const rowAction = sourceButton.dataset.action || action;
    if (['test', 'reset', 'toggle'].includes(rowAction)) {
      state.rowFocusKeyId = id;
      state.rowFocusAction = rowAction;
      // Keep intent long enough for API latency + table rebuild + optional follow-up refresh paint.
      state.rowFocusUntil = Date.now() + 3200;
    }
    state.detailFocusAction = null;
    state.detailFocusUntil = 0;
  } else if (['test', 'reset', 'enable', 'disable', 'copy'].includes(action)) {
    const focusAction = action === 'enable' ? 'disable' : action === 'disable' ? 'enable' : action;
    state.detailFocusAction = focusAction;
    state.detailFocusUntil = Date.now() + 1600;
    state.rowFocusKeyId = null;
    state.rowFocusAction = null;
    state.rowFocusUntil = 0;
  }
  try {
    if (action === 'copy') {
      const key = state.keys.find((item) => item.id === id);
      if (!rawKeyDisplayAllowed(key)) {
        state.lastOperation = { id, tone: 'warn', title: '复制', message: '当前环境未开启原始密钥显示。VPS 部署建议保持关闭。', time: stamp(Date.now()) };
        renderDetails();
        showToast('原始密钥显示已关闭。可在顶部安全区重新开启「显示原文」后再复制。', 'warn');
        return;
      }
      const confirmed = window.confirm('将显示并复制原始 Exa API Key，此操作会写入管理员审计。继续？');
      if (!confirmed) return;
      const result = await api('/_proxy/keys/' + encodeURIComponent(id) + '/secret', { method: 'POST' });
      try {
        await navigator.clipboard.writeText(result.secret || '');
      } catch {
        state.lastOperation = { id, tone: 'bad', title: '复制', message: '剪贴板写入失败，请检查浏览器权限或是否处于安全上下文（HTTPS）。', time: stamp(Date.now()) };
        renderDetails();
        showToast('剪贴板写入失败，请检查浏览器权限或使用 HTTPS 后重试。', 'bad');
        return;
      }
      state.lastOperation = { id, tone: 'good', title: '复制', message: '原始密钥已复制到剪贴板，并写入管理员审计。', time: stamp(Date.now()) };
      renderDetails();
      showToast('原始密钥已复制。请妥善保管，勿粘贴到不可信环境。');
      return;
    }
    let toastTone = 'good';
    if (action === 'disable') {
      await api('/_proxy/keys/' + encodeURIComponent(id) + '/disable', { method: 'POST' });
      state.lastOperation = { id, tone: 'warn', title: '禁用', message: '密钥 ' + displayLabelById(id) + ' 已禁用，调度器不会继续分配新请求。', time: stamp(Date.now()) };
    }
    if (action === 'enable') {
      await api('/_proxy/keys/' + encodeURIComponent(id) + '/enable', { method: 'POST' });
      state.lastOperation = { id, tone: 'good', title: '启用', message: '密钥 ' + displayLabelById(id) + ' 已启用，可重新参与请求调度。', time: stamp(Date.now()) };
    }
    if (action === 'reset') {
      await api('/_proxy/keys/' + encodeURIComponent(id) + '/reset-circuit', { method: 'POST' });
      state.lastOperation = { id, tone: 'good', title: '重置', message: '密钥 ' + displayLabelById(id) + ' 的冷却诊断已重置，当前冷却状态会随刷新同步。', time: stamp(Date.now()) };
    }
    if (action === 'test') {
      state.lastOperation = { id, tone: 'warn', title: '测试中', message: '正在使用密钥 ' + displayLabelById(id) + ' 发起上游探测请求。', time: stamp(Date.now()) };
      renderDetails();
      const result = await api('/_proxy/keys/' + encodeURIComponent(id) + '/test', { method: 'POST' });
      const ok = Boolean(result.ok);
      toastTone = ok ? 'good' : 'bad';
      state.lastOperation = { id, tone: ok ? 'good' : 'bad', title: '测试密钥', message: '测试密钥 ' + displayLabelById(id) + ' 完成：状态 ' + (result.status || '-') + '，延迟 ' + ms(result.latencyMs) + '，结果 ' + labelOf(result.reason) + '。', time: stamp(Date.now()) };
    }
    showToast('密钥 ' + displayLabelById(id) + ' 已更新。可查看详情健康状态或继续批量操作。', toastTone);
    await refresh({ force: true });
  } finally {
    restore();
  }
}

async function runExportLogs() {
  const button = el('exportLogs');
  const restore = setButtonPending(button, '正在导出');
  try {
    await exportLogs();
    showToast('请求日志已导出。可在下载目录打开 CSV，或调整筛选后再次导出。');
  } catch (error) {
    showToast('请求日志导出失败：' + (error.message || '未知错误') + '。请检查筛选条件或网络后重试。', 'bad');
  } finally {
    restore();
  }
}

async function runExportAudit() {
  const button = el('exportAudit');
  const restore = setButtonPending(button, '正在导出');
  try {
    await exportAudit();
    showToast('审计记录已导出。可在下载目录打开 CSV，或继续筛选审计证据。');
  } catch (error) {
    showToast('审计导出失败：' + (error.message || '未知错误') + '。请检查筛选条件或网络后重试。', 'bad');
  } finally {
    restore();
  }
}

function normalizeImportEntry(entry) {
  const value = String(entry?.value || '').trim();
  const id = String(entry?.id || '').trim();
  const normalized = { value };
  if (id) normalized.id = id;
  if (Object.prototype.hasOwnProperty.call(entry || {}, 'weight')) {
    const weight = Number(entry.weight);
    if (!Number.isInteger(weight) || weight < 1) return { entry: normalized, error: '权重必须是正整数' };
    normalized.weight = weight;
  }
  if (!value) return { entry: normalized, error: '缺少密钥值' };
  return { entry: normalized };
}

function parseImportLine(line) {
  const text = line.trim();
  if (!text) return { skip: true };
  if (text.startsWith('{') || text.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: 'JSON 格式无法解析' };
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return { error: 'JSON 行必须是对象' };
    return normalizeImportEntry(parsed);
  }

  const parts = text.split(':');
  if (parts.length >= 3) {
    const weightText = parts[parts.length - 1].trim();
    const value = parts.slice(1, -1).join(':').trim();
    return normalizeImportEntry({ id: parts[0], value, weight: weightText });
  }
  if (parts.length === 2) return normalizeImportEntry({ id: parts[0], value: parts[1] });
  return normalizeImportEntry({ value: text });
}

function buildImportPreview(text) {
  const rawLines = text.split(/\r?\n/);
  const keys = [];
  const issues = [];
  const seenValues = new Set();
  const seenIds = new Set();
  let duplicateCount = 0;
  let invalidCount = 0;
  let nonEmptyCount = 0;

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    nonEmptyCount += 1;
    const parsed = parseImportLine(trimmed);
    if (parsed.skip) return;
    if (parsed.error) {
      invalidCount += 1;
      if (issues.length < 4) issues.push({ tone: 'bad', text: '第 ' + fmt(index + 1) + ' 行：' + parsed.error });
      return;
    }
    const valueKey = parsed.entry.value;
    if (seenValues.has(valueKey)) {
      duplicateCount += 1;
      if (issues.length < 4) issues.push({ tone: 'warn', text: '第 ' + fmt(index + 1) + ' 行：重复密钥已跳过' });
      return;
    }
    const idKey = parsed.entry.id || '';
    if (idKey && seenIds.has(idKey)) {
      duplicateCount += 1;
      if (issues.length < 4) issues.push({ tone: 'warn', text: '第 ' + fmt(index + 1) + ' 行：重复 ID 已跳过' });
      return;
    }
    seenValues.add(valueKey);
    if (idKey) seenIds.add(idKey);
    keys.push(parsed.entry);
  });

  if (!nonEmptyCount) issues.push({ tone: 'muted', text: '粘贴密钥或选择文件后，会在这里预览导入结果。' });
  else if (keys.length) issues.unshift({ tone: 'good', text: '将提交 ' + fmt(keys.length) + ' 个可导入密钥。' });
  else issues.unshift({ tone: 'bad', text: '没有可导入的密钥，请修正后再提交。' });

  if (issues.length > 5) issues.length = 5;
  return { keys, nonEmptyCount, duplicateCount, invalidCount, issues };
}

function renderImportPreview(preview) {
  const previewEl = el('importPreview');
  const isEmpty = preview.nonEmptyCount === 0;
  const hasWarnings = preview.duplicateCount > 0 || preview.invalidCount > 0;
  const statusClass = isEmpty ? 'is-empty' : preview.keys.length ? 'is-ready' : 'is-blocked';
  const recommendation = importPreviewRecommendation(preview);
  const stateLabel = preview.keys.length ? hasWarnings ? '可导入，有跳过项' : '可提交' : isEmpty ? '待输入' : '需要修正';
  previewEl.className = 'import-preview ' + statusClass + (hasWarnings ? ' has-warnings' : '');
  previewEl.setAttribute('role', 'status');
  previewEl.setAttribute('aria-live', 'polite');
  previewEl.setAttribute('aria-atomic', 'true');
  const previewNext = preview.keys.length
    ? '可点击开始导入提交，或继续修改输入'
    : isEmpty
      ? '可粘贴密钥或选择文件后预检'
      : '请修正无效行或删除重复项后再试';
  previewEl.setAttribute(
    'aria-label',
    '导入预览：' + recommendation.title + '。可导入 ' + fmt(preview.keys.length) + '，重复 ' + fmt(preview.duplicateCount) + '，无效 ' + fmt(preview.invalidCount) + '。' + recommendation.text + '。' + previewNext
  );
  previewEl.innerHTML = '<div class="import-preview-head"><span class="import-preview-title">导入预览</span><span class="import-preview-state">' + esc(stateLabel) + '</span></div>' +
    '<div class="import-stats">' +
      '<div class="import-stat good"><span>可导入</span><strong>' + fmt(preview.keys.length) + '</strong></div>' +
      '<div class="import-stat warn"><span>重复</span><strong>' + fmt(preview.duplicateCount) + '</strong></div>' +
      '<div class="import-stat bad"><span>无效</span><strong>' + fmt(preview.invalidCount) + '</strong></div>' +
    '</div>' +
    '<div class="import-recommendation ' + esc(recommendation.tone) + '"><strong>' + esc(recommendation.title) + '</strong><span>' + esc(recommendation.text) + '</span></div>' +
    '<ul class="import-issues">' + preview.issues.map((issue) => '<li class="' + (issue.tone || '') + '">' + esc(issue.text) + '</li>').join('') + '</ul>';
  const confirm = el('confirmImport');
  if (confirm) {
    const canSubmit = !importPending && preview.keys.length > 0;
    confirm.disabled = !canSubmit;
    confirm.setAttribute(
      'aria-label',
      canSubmit
        ? '确认开始批量导入 ' + fmt(preview.keys.length) + ' 个密钥。提交后会刷新密钥池并写入审计'
        : isEmpty
          ? '开始导入不可用。请先粘贴或选择可导入密钥'
          : '开始导入不可用。请修正预检问题后再试'
    );
  }
  return preview;
}

function importPreviewRecommendation(preview) {
  if (preview.nonEmptyCount === 0) {
    return { tone: 'muted', title: '待输入', text: '粘贴密钥或选择文件后，预检会显示可导入、重复和无效行。' };
  }
  const skipped = preview.duplicateCount + preview.invalidCount;
  if (preview.keys.length === 0) {
    return { tone: 'bad', title: '需要修正', text: '当前输入没有可导入密钥，请修正无效行或删除重复项。' };
  }
  if (skipped > 0) {
    return { tone: 'warn', title: '可导入，但有跳过项', text: '将导入 ' + fmt(preview.keys.length) + ' 个密钥，并跳过 ' + fmt(skipped) + ' 行。' };
  }
  return { tone: 'good', title: '可以提交', text: '将导入 ' + fmt(preview.keys.length) + ' 个密钥，提交后会刷新密钥池并写入审计。' };
}

function updateImportPreview() {
  return renderImportPreview(buildImportPreview(el('importTextarea').value));
}

function isSupportedImportFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return type.startsWith('text/') || type === 'application/json' || ['.txt', '.csv', '.json'].some((suffix) => name.endsWith(suffix));
}

function setImportFileStatus(stateName, message) {
  const target = el('importFileName');
  if (!target) return;
  const safeState = ['idle', 'reading', 'ready', 'error'].includes(stateName) ? stateName : 'idle';
  const text = String(message || '').trim() || '待选文件';
  const labelPrefix = {
    idle: '导入文件：',
    reading: '导入文件读取中：',
    ready: '导入文件已载入：',
    error: '导入文件错误：'
  }[safeState];
  const fileNext = {
    idle: '可拖入或选择 .txt / .csv / .json 文件',
    reading: '请稍候',
    ready: '可继续编辑文本或点击开始导入',
    error: '请改选文本密钥文件后重试'
  }[safeState];
  target.dataset.importFileState = safeState;
  target.className = 'import-file-name is-' + safeState;
  target.setAttribute('role', 'status');
  target.setAttribute('aria-atomic', 'true');
  target.setAttribute('aria-live', safeState === 'error' ? 'assertive' : 'polite');
  target.setAttribute('aria-label', labelPrefix + text + '。' + fileNext);
  target.textContent = text;
}

function readImportFile(file) {
  if (!isSupportedImportFile(file)) {
    setImportFileStatus('error', '不支持的文件类型');
    showToast('仅支持 .txt、.csv 或 .json 文本文件。请改选文本密钥文件后重试。', 'warn');
    return;
  }
  setImportFileStatus('reading', '正在读取 ' + file.name);
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
    el('importTextarea').value = text;
    setImportFileStatus('ready', file.name + ' · ' + fmt(lineCount) + ' 行');
    el('importTextarea').dispatchEvent(new Event('input'));
  };
  reader.onerror = () => {
    setImportFileStatus('error', '文件读取失败');
    showToast('文件读取失败，请重新选择文本密钥文件后重试。', 'bad');
  };
  reader.readAsText(file);
}

function focusableImportControls() {
  return Array.from(el('importModal').querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'))
    .filter((control) => !control.disabled && !control.hidden && control.offsetParent !== null);
}

function rememberImportFocusReturn() {
  const active = document.activeElement;
  importFocusReturn = active instanceof HTMLElement && document.body.contains(active) ? active : null;
}

function restoreImportFocus() {
  if (importFocusReturn && importFocusReturn.isConnected && typeof importFocusReturn.focus === 'function') importFocusReturn.focus();
  importFocusReturn = null;
}

function trapImportFocus(event) {
  if (event.key !== 'Tab' || !el('importModal').classList.contains('modal-open')) return;
  const controls = focusableImportControls();
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

function openImportModal() {
  rememberImportFocusReturn();
  importPending = false;
  el('importTextarea').value = '';
  el('importFileInput').value = '';
  setImportFileStatus('idle', '待选文件');
  el('importDropzone').classList.remove('is-dragging');
  const confirm = el('confirmImport');
  if (confirm) {
    confirm.textContent = '开始导入';
    confirm.setAttribute('aria-label', '开始导入不可用。请先粘贴或选择可导入密钥');
  }
  const bulk = el('bulkImportBtn');
  if (bulk) bulk.setAttribute('aria-label', '批量导入已打开。可粘贴密钥或选择文件后预检');
  const closeBtn = el('closeImportModal');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭批量导入，返回密钥池');
  const cancel = el('cancelImport');
  if (cancel) cancel.setAttribute('aria-label', '取消批量导入，返回密钥池');
  updateImportPreview();
  el('importModal').classList.add('modal-open');
  el('importTextarea').focus();
}

function closeImportModal() {
  if (!el('importModal').classList.contains('modal-open')) return;
  el('importModal').classList.remove('modal-open');
  const bulk = el('bulkImportBtn');
  if (bulk) bulk.setAttribute('aria-label', '打开批量导入密钥。可粘贴或选择文件后预检再提交');
  const closeBtn = el('closeImportModal');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭批量导入，返回密钥池');
  const cancel = el('cancelImport');
  if (cancel) cancel.setAttribute('aria-label', '取消批量导入，返回密钥池');
  restoreImportFocus();
}

async function submitImport() {
  const { keys } = updateImportPreview();
  if (!keys.length) { showToast('未解析到有效密钥。请检查格式（每行一个 Key 或 id:key:weight）后重试。', 'warn'); return; }

  importPending = true;
  const restore = setButtonPending(el('confirmImport'), '正在导入…');
  try {
    const result = await api('/_proxy/keys/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keys })
    });
    showToast('导入完成：成功 ' + fmt(result.imported) + '，跳过 ' + fmt(result.skipped) + (result.totalErrors ? '，错误 ' + fmt(result.totalErrors) : '') + '。可在密钥池筛选新导入项并测试连通性。', result.totalErrors ? 'warn' : 'good');
    closeImportModal();
    await refresh({ force: true });
  } catch (error) {
    showToast('导入失败：' + (error.message || '未知错误') + '。请检查文件格式后重试。', 'bad');
  } finally {
    importPending = false;
    restore();
    if (el('importModal').classList.contains('modal-open')) updateImportPreview();
  }
}

function connectEventStream() {
  if (!window.EventSource || state.events || !currentSessionId()) {
    if (!currentSessionId() || document.querySelector('[data-console-shell]')?.hidden) setLiveLinkStatus('offline');
    return;
  }
  clearTimeout(reconnectTimer);
  const source = new EventSource('/_proxy/events?sessionId=' + encodeURIComponent(currentSessionId()));
  state.events = source;
  setLiveLinkStatus('reconnecting');
  source.onopen = () => setLiveLinkStatus('live');
  source.addEventListener('snapshot', () => {
    if (state.eventRefreshPending || document.querySelector('[data-console-shell]').hidden) return;
    state.eventRefreshPending = true;
    setLiveLinkStatus('live');
    window.setTimeout(() => {
      refresh().catch((error) => {
        if (isSessionExpiredError(error)) forceSessionExpired(error.message);
      }).finally(() => { state.eventRefreshPending = false; });
    }, 350);
  });
  source.onerror = () => {
    closeEventStream();
    if (document.querySelector('[data-console-shell]')?.hidden || !currentSessionId()) {
      setLiveLinkStatus('offline');
      return;
    }
    setLiveLinkStatus('reconnecting');
    reconnectTimer = window.setTimeout(connectEventStream, 5000);
  };
}

function resetTimer() {
  if (state.timer) clearInterval(state.timer);
  if (!document.querySelector('[data-console-shell]').hidden && el('autoRefresh').checked) state.timer = setInterval(() => { if (!state.eventRefreshPending) refresh().catch(() => {}); }, Math.max(5000, Number(el('refreshInterval').value)));
}

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
    setLoginError('请输入管理员令牌后再进入控制台。本地演示可点「填入 demo 令牌」。');
    loginToken.focus();
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
    loginButton.setAttribute('aria-label', '使用管理员令牌进入控制台。可先填入 demo 令牌或直接提交');
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
      ? '令牌可见性：已显示。点击切换为隐藏'
      : '令牌可见性：已隐藏。点击切换为显示'
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
el('fillDemoToken').addEventListener('click', () => {
  loginToken.value = 'admin_local_token';
  token.value = 'admin_local_token';
  el('loginCapsHint').hidden = true;
  const status = el('authHintStatus');
  if (status) {
    status.textContent = '已填入本地 demo 令牌，点击进入控制台后仍会由服务端校验。';
    status.setAttribute('aria-label', '登录提示：已填入本地 demo 令牌。点击进入控制台后仍会由服务端校验');
    status.classList.add('good');
  }
  const demoBtn = el('fillDemoToken');
  if (demoBtn) demoBtn.setAttribute('aria-label', '已填入本地演示管理员令牌。可点击进入控制台继续校验');
  el('loginButton').focus();
});
el('keySearch').addEventListener('input', debounce(() => { state.keyPage = 1; renderKeys(); }, 250));
el('logSearch').addEventListener('input', debounce(renderLogs, 250));
const debouncedFetchLogs = debounce(() => reloadLogs().catch((error) => showErrorToast(error)), 250);
el('logPathFilter').addEventListener('input', debouncedFetchLogs);
el('logKeyFilter').addEventListener('input', debouncedFetchLogs);
el('logStatusFilter').addEventListener('change', () => reloadLogs().catch((error) => showErrorToast(error)));
el('applyLogFilters').addEventListener('click', () => reloadLogs({ button: el('applyLogFilters'), pendingText: '正在刷新' }).catch((error) => showErrorToast(error)));
el('clearLogFilters').addEventListener('click', () => clearLogFilters().catch((error) => showErrorToast(error)));
if (el('logFilterChips')) {
  el('logFilterChips').addEventListener('click', (event) => {
    const chip = event.target.closest('button[data-filter-remove]');
    if (!chip) return;
    removeLogFilterDimension(chip.dataset.filterRemove || '').catch((error) => showErrorToast(error));
  });
}
el('logDiagnostics').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-log-diagnostic-action]');
  if (!button) return;
  runLogDiagnosticAction(button).catch((error) => showErrorToast(error));
});
el('clearKeyFilters').addEventListener('click', clearKeyFilters);
if (el('keyFilterSummaryChips')) {
  el('keyFilterSummaryChips').addEventListener('click', (event) => {
    const chip = event.target.closest('button[data-filter-remove]');
    if (!chip) return;
    removeKeyFilterDimension(chip.dataset.filterRemove || '');
  });
}
el('keyWorkflowSummary').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-key-workflow-action]');
  if (!button) return;
  runKeyWorkflowAction(button);
});
el('exportLogs').addEventListener('click', () => runExportLogs().catch((error) => showErrorToast(error)));
el('exportAudit').addEventListener('click', () => runExportAudit().catch((error) => showErrorToast(error)));
el('openCommandPalette').addEventListener('click', () => openCommandPalette(el('openCommandPalette')));
el('closeCommandPalette').addEventListener('click', () => closeCommandPalette());
el('commandSearch').addEventListener('input', () => { activeCommandIndex = 0; renderCommandPalette(); });
el('commandList').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-command-index]');
  if (!button) return;
  runCommand(visibleCommands()[Number(button.dataset.commandIndex)]);
});
el('commandList').addEventListener('mouseover', (event) => {
  const button = event.target.closest('button[data-command-index]');
  if (!button) return;
  setActiveCommand(Number(button.dataset.commandIndex));
});
el('commandList').addEventListener('focusin', (event) => {
  const button = event.target.closest('button[data-command-index]');
  if (!button) return;
  setActiveCommand(Number(button.dataset.commandIndex));
});
el('auditSearch').addEventListener('input', debounce(renderAudit, 250));
el('auditActionFilter').addEventListener('change', renderAudit);
el('auditOutcomeFilter').addEventListener('change', renderAudit);
el('clearAuditFilters').addEventListener('click', clearAuditFilters);
if (el('auditFilterChips')) {
  el('auditFilterChips').addEventListener('click', (event) => {
    const chip = event.target.closest('button[data-filter-remove]');
    if (!chip) return;
    removeAuditFilterDimension(chip.dataset.filterRemove || '');
  });
}
if (el('refreshAuditList')) {
  el('refreshAuditList').addEventListener('click', () => {
    reloadAudit({ button: el('refreshAuditList'), pendingText: '正在刷新' }).catch((error) => showErrorToast(error));
  });
}
el('auditList').addEventListener('click', (event) => {
  const emptyAction = event.target.closest('button[data-empty-action]');
  if (!emptyAction) return;
  if (emptyAction.dataset.emptyAction === 'clear-audit-filters') {
    clearAuditFilters();
    return;
  }
  if (emptyAction.dataset.emptyAction === 'refresh-audit') {
    reloadAudit({ button: emptyAction, pendingText: '正在刷新' }).catch((error) => showErrorToast(error));
    return;
  }
  if (emptyAction.dataset.emptyAction === 'open-keys') {
    switchTab('keys');
    showToast('已打开密钥池，完成操作后可回到审计查看证据');
  }
});
el('auditEvidence').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-audit-evidence-action]');
  if (!button) return;
  runAuditEvidenceAction(button).catch((error) => showErrorToast(error));
});
el('configEvidence').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-config-posture-action]');
  if (!button) return;
  focusConfigPosture(button.dataset.configPostureAction || '');
});
el('launchReadiness').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-readiness-copy]');
  if (!button) return;
  copyReadinessCommand(button).catch((error) => showErrorToast(error));
});
el('pruneLogs').addEventListener('click', () => requestPruneLogsConfirm());
el('timeRange').addEventListener('change', () => refresh().catch((error) => showErrorToast(error)));
document.querySelector('[data-tab-panel="overview"]').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-overview-signal-action], button[data-overview-action]');
  if (!button) return;
  const actionId = button.dataset.overviewSignalAction || button.dataset.overviewAction;
  runOverviewAction(actionId, button).catch((error) => showErrorToast(error));
});
el('batchTestPage').addEventListener('click', () => batchKeyAction('test', state.pageKeyIds).catch((error) => showErrorToast(error)));
el('batchDisableProblems').addEventListener('click', () => requestBatchDisableConfirm(state.problemKeyIds, 'problems'));
el('bulkImportBtn').addEventListener('click', openImportModal);
el('closeImportModal').addEventListener('click', closeImportModal);
el('cancelImport').addEventListener('click', closeImportModal);
el('confirmImport').addEventListener('click', () => submitImport().catch((error) => showErrorToast(error)));
el('closeConfirmAction').addEventListener('click', closeConfirmAction);
el('confirmActionCancel').addEventListener('click', closeConfirmAction);
el('confirmActionAccept').addEventListener('click', () => acceptConfirmAction());
el('confirmActionModal').addEventListener('click', (event) => {
  if (event.target === el('confirmActionModal')) closeConfirmAction();
});
el('importTextarea').addEventListener('input', updateImportPreview);
el('importFileButton').addEventListener('click', () => el('importFileInput').click());
el('importFileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) readImportFile(file);
});
['dragenter', 'dragover'].forEach((eventName) => {
  el('importDropzone').addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    el('importDropzone').classList.add('is-dragging');
  });
});
el('importDropzone').addEventListener('dragleave', (event) => {
  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
  el('importDropzone').classList.remove('is-dragging');
});
el('importDropzone').addEventListener('drop', (event) => {
  event.preventDefault();
  el('importDropzone').classList.remove('is-dragging');
  const file = event.dataTransfer?.files[0];
  if (file) readImportFile(file);
});
el('importModal').addEventListener('click', (event) => {
  if (event.target === el('importModal')) closeImportModal();
});
el('commandPalette').addEventListener('click', (event) => {
  if (event.target === el('commandPalette')) {
    closeCommandPalette();
    return;
  }
  const emptyAction = event.target.closest('button[data-command-empty-action]');
  if (!emptyAction) return;
  const action = emptyAction.dataset.commandEmptyAction || '';
  if (action === 'clear-search') {
    el('commandSearch').value = '';
    activeCommandIndex = 0;
    renderCommandPalette();
    el('commandSearch').focus();
    showToast('已清空快速操作搜索。可继续输入关键词，或用方向键选择操作。');
    return;
  }
  if (action === 'suggest-keys') {
    el('commandSearch').value = '密钥';
    activeCommandIndex = 0;
    renderCommandPalette();
    el('commandSearch').focus();
    showToast('已用「密钥」重试搜索。可 Enter 执行匹配项，或改搜「日志」「审计」。');
  }
});
document.addEventListener('keydown', (event) => {
  trapImportFocus(event);
  trapConfirmActionFocus(event);
  trapCommandPaletteFocus(event);
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k' && !shouldIgnoreCommandShortcut(event)) {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (event.key === 'Escape' && !el('commandPalette').hidden) {
    event.preventDefault();
    closeCommandPalette();
    return;
  }
  handleCommandPaletteKeydown(event);
  if (event.key === 'Escape' && isConfirmActionOpen()) {
    event.preventDefault();
    closeConfirmAction();
    return;
  }
  if (event.key === 'Escape' && el('importModal').classList.contains('modal-open')) closeImportModal();
});
el('toggleSecretDisplay').addEventListener('click', () => {
  state.secretDisplay = state.secretDisplay === 'plain' ? 'masked' : 'plain';
  localStorage.setItem('exaSecretDisplay', state.secretDisplay);
  syncSecretToggleState();
  renderKeys();
  renderLogs();
  renderDetails();
});
el('prevKeyPage').addEventListener('click', () => { state.keyPage -= 1; renderKeys(); });
el('nextKeyPage').addEventListener('click', () => { state.keyPage += 1; renderKeys(); });
function runKeyEmptyAction(action) {
  if (action === 'import') {
    openImportModal();
    return true;
  }
  if (action === 'clear-filters') {
    clearKeyFilters();
    return true;
  }
  if (action === 'select-first-key') {
    const firstId = state.pageKeyIds[0] || state.keys[0]?.id || '';
    if (!firstId) {
      showToast('当前没有可查看的密钥。请先导入或清除筛选。', 'warn');
      return true;
    }
    keyAction(firstId, 'select').catch((error) => showErrorToast(error));
    showToast('已打开密钥 ' + displayLabelById(firstId) + ' 详情。可测试/重置冷却，或查看关联请求日志。');
    return true;
  }
  if (action === 'focus-key-search') {
    focusControlInTab('keys', 'keySearch');
    showToast('已聚焦密钥搜索。可输入 ID 或标签，Enter 后查看匹配项。');
    return true;
  }
  return false;
}

el('keysBody').addEventListener('click', (event) => {
  const emptyAction = event.target.closest('button[data-empty-action]');
  if (emptyAction && runKeyEmptyAction(emptyAction.dataset.emptyAction || '')) return;
  if (event.target.closest('.key-checkbox')) return;
  const row = event.target.closest('tr[data-key-id]');
  if (!row) return;
  const button = event.target.closest('button[data-action]');
  const action = button ? button.dataset.action : 'select';
  keyAction(row.dataset.keyId, action, button).catch((error) => showErrorToast(error));
});
document.querySelectorAll('#logsBody, #tracePanel').forEach((traceRoot) => {
  traceRoot.addEventListener('click', (event) => {
    const emptyAction = event.target.closest('button[data-empty-action]');
    if (emptyAction && emptyAction.dataset.emptyAction === 'clear-log-filters') {
      clearLogFilters().catch((error) => showErrorToast(error));
      return;
    }
    if (emptyAction && emptyAction.dataset.emptyAction === 'refresh-logs') {
      reloadLogs({ button: emptyAction, pendingText: '正在刷新' }).catch((error) => showErrorToast(error));
      return;
    }
    if (emptyAction && emptyAction.dataset.emptyAction === 'focus-log-search') {
      focusControlInTab('logs', 'logSearch');
      showToast('已聚焦请求日志搜索。可输入 requestId，或按路径/状态筛选。');
      return;
    }
    const keyButton = event.target.closest('button[data-log-key-action="open-detail"][data-key-id]');
    if (keyButton) {
      openKeyDetailFromLog(keyButton.dataset.keyId).catch((error) => showErrorToast(error));
      return;
    }
    const button = event.target.closest('button[data-trace-id]');
    if (!button) return;
    loadLogTrace(button.dataset.traceId).catch((error) => showErrorToast(error));
  });
});
document.querySelectorAll('.detail-body-target').forEach((detailBody) => {
  detailBody.addEventListener('click', (event) => {
    const emptyAction = event.target.closest('button[data-empty-action]');
    if (emptyAction && runKeyEmptyAction(emptyAction.dataset.emptyAction || '')) return;
    const button = event.target.closest('button[data-detail-action]');
    if (!button || !state.selectedId) return;
    keyAction(state.selectedId, button.dataset.detailAction, button).catch((error) => showErrorToast(error));
  });
});
if (el('closeMobileDetails')) el('closeMobileDetails').addEventListener('click', closeMobileDetailsPanel);
function syncAutoRefreshAria() {
  const auto = el('autoRefresh');
  if (!auto) return;
  auto.setAttribute(
    'aria-label',
    auto.checked
      ? '自动刷新：已开启。可取消以仅手动刷新控制台数据'
      : '自动刷新：已关闭。可勾选以按间隔自动刷新控制台数据'
  );
}
el('autoRefresh').addEventListener('change', () => {
  syncAutoRefreshAria();
  resetTimer();
});
el('refreshInterval').addEventListener('change', resetTimer);

window.addEventListener('resize', debounce(syncTableScrollAffordances, 120));
document.querySelectorAll('.table-scroll').forEach((scroller) => {
  scroller.addEventListener('scroll', () => syncTableScrollAffordance(scroller), { passive: true });
});

// Primary tab navigation; desktop sidebar and mobile rail share the same tab state.
document.querySelectorAll('[data-tab-nav]').forEach((nav) => {
  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('.nav-item[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });
});

// Sidebar collapse toggle (persisted in localStorage)
const collapseBtn = el('sidebarCollapse');
const collapseIcon = collapseBtn?.querySelector('.nav-icon');
const collapseLabel = collapseBtn?.querySelector('.nav-label');
const shellEl = document.querySelector('[data-console-shell]');
function syncSidebarCollapseControl(collapsed) {
  if (!collapseBtn) return;
  const isCollapsed = Boolean(collapsed);
  if (collapseIcon) collapseIcon.classList.toggle('is-collapsed', isCollapsed);
  if (collapseLabel) collapseLabel.textContent = isCollapsed ? '展开' : '收起';
  collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
  collapseBtn.setAttribute('aria-pressed', String(isCollapsed));
  collapseBtn.setAttribute(
    'aria-label',
    isCollapsed
      ? '侧栏导航：已收起。点击展开完整导航标签'
      : '侧栏导航：已展开。点击收起为图标导航'
  );
  collapseBtn.title = isCollapsed ? '展开侧栏' : '收起侧栏';
}
if (collapseBtn && shellEl) {
  const startCollapsed = localStorage.getItem('exaSidebarCollapsed') === '1';
  if (startCollapsed) shellEl.setAttribute('data-sidebar-collapsed', '');
  else shellEl.removeAttribute('data-sidebar-collapsed');
  syncSidebarCollapseControl(startCollapsed);
  collapseBtn.addEventListener('click', () => {
    const collapsed = shellEl.hasAttribute('data-sidebar-collapsed');
    if (collapsed) {
      shellEl.removeAttribute('data-sidebar-collapsed');
      localStorage.setItem('exaSidebarCollapsed', '0');
      syncSidebarCollapseControl(false);
    } else {
      shellEl.setAttribute('data-sidebar-collapsed', '');
      localStorage.setItem('exaSidebarCollapsed', '1');
      syncSidebarCollapseControl(true);
    }
  });
}

// Select all keys checkbox (in thead)
if (el('selectAllKeys')) el('selectAllKeys').addEventListener('change', (event) => {
  const checked = event.target.checked;
  state.selectedKeyIds = checked ? state.pageKeyIds.slice() : [];
  renderKeys();
  updateBatchBar();
});

// Delegated individual checkbox clicks on keysBody
el('keysBody').addEventListener('change', (event) => {
  const cb = event.target.closest('.key-checkbox');
  if (!cb) return;
  const id = cb.dataset.keyCheck;
  if (cb.checked) {
    if (!state.selectedKeyIds.includes(id)) state.selectedKeyIds.push(id);
  } else {
    state.selectedKeyIds = state.selectedKeyIds.filter((k) => k !== id);
  }
  updateBatchBar();
});

// Page size selector
if (el('keyPageSize')) el('keyPageSize').addEventListener('change', (event) => {
  state.keyPageSize = Number(event.target.value);
  state.keyPage = 1;
  renderKeys();
});

// Jump to page
if (el('jumpKeyPage')) el('jumpKeyPage').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const page = Number(event.target.value);
  const maxPage = Math.max(1, Math.ceil(state.keys.length / state.keyPageSize));
  if (page >= 1 && page <= maxPage) { state.keyPage = page; renderKeys(); }
  event.target.value = '';
});

// Batch action bar buttons
if (el('batchClearSelection')) el('batchClearSelection').addEventListener('click', clearBatchSelection);
if (el('batchEnableSelected')) el('batchEnableSelected').addEventListener('click', () => batchKeyAction('enable', state.selectedKeyIds).catch((e) => showErrorToast(e)));
if (el('batchDisableSelected')) el('batchDisableSelected').addEventListener('click', () => requestBatchDisableConfirm(state.selectedKeyIds, 'selected'));
if (el('batchResetSelected')) el('batchResetSelected').addEventListener('click', () => batchKeyAction('reset', state.selectedKeyIds).catch((e) => showErrorToast(e)));
if (el('batchTestSelected')) el('batchTestSelected').addEventListener('click', () => batchKeyAction('test', state.selectedKeyIds).catch((e) => showErrorToast(e)));
window.addEventListener('resize', () => syncToastLift());

// Filter chips
if (el('keyFilterChips')) el('keyFilterChips').addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  state.keyFilter = chip.dataset.chip || 'All';
  state.keyPage = 1;
  renderKeys();
});

// Sortable column headers
document.querySelector('.key-table-scroll thead').addEventListener('click', (event) => {
  const button = event.target.closest('.sort-btn[data-sort]');
  if (!button) return;
  applyKeySort(button.dataset.sort);
});

showLogin();
syncSecretToggleState();
syncTableScrollAffordances();
setRefreshStatus('waiting');
if (currentSessionId()) {
  verifyStoredSession()
    .then(async () => { showConsole(); await refresh(); })
    .catch(() => { clearToken(); showLogin(); });
} else if (token.value) {
  verifyAdminToken(token.value)
    .then(async () => { showConsole(); await refresh(); })
    .catch(() => { clearToken(); showLogin(); });
}
