import { api, clearToken, currentSessionId, exportAudit, exportLogs, fetchConfigSummary, fetchKeyFailureSummary, fetchLogTrace, fetchLogs, fetchObservability, verifyAdminToken, verifyStoredSession } from './api.js';
import { debounce, displayLabelById, el, esc, fmt, labelOf, loginToken, ms, rawDisplayLabel, rawKeyDisplayAllowed, stamp, state, statusOf, token } from './state.js';
import { renderDetails, renderKeys, showKeyOnCurrentPage, syncSecretToggleState, syncSelectAllKeysControl, updateKeyWorkflowSelection, updateSummary } from './renderKeys.js';
import { renderAudit, renderLogTrace, renderLogs } from './renderLogs.js';
import { renderConfigSummary, renderObservability } from './renderObservability.js';
import { showErrorToast, showToast, syncToastLift } from './ui/toast.js';
import { setButtonBusy, setButtonPending } from './ui/busy.js';
import { isUsefulFocusReturn, scheduleControlFocus, scheduleElementFocus } from './ui/focus.js';
import { acceptConfirmAction, closeConfirmAction, isConfirmActionOpen, openConfirmAction, trapConfirmActionFocus } from './ui/confirm-action.js';
import { setLiveLinkStatus, setRefreshStatus, updateLastUpdated } from './live/refresh.js';
import { closeEventStream, createEventStream } from './live/events.js';
import { createSessionShell, isSessionExpiredError, setLoginError, syncLoginCapsHint } from './session/auth-ui.js';
import { createTabs } from './nav/tabs.js';
import { createCommandPalette } from './command/palette.js';
import {
  applyLogKeyFilter,
  applyLogStatusFilter,
  clearLogFilters,
  reloadLogs,
  removeLogFilterDimension,
  runLogDiagnosticAction
} from './logs/actions.js';
import {
  applyProblemKeyFilter,
  clearKeyFilters,
  focusKeyFilterChip,
  removeKeyFilterDimension
} from './keys/actions.js';
import {
  bindImportRefresh,
  closeImportModal,
  openImportModal,
  readImportFile,
  submitImport,
  trapImportFocus,
  updateImportPreview
} from './keys/import.js';
import {
  clearAuditFilters,
  focusAuditOutcomeFilter,
  focusAuditSearch,
  reloadAudit,
  removeAuditFilterDimension,
  runAuditEvidenceAction
} from './audit/actions.js';

let refreshInFlight = null;
let configPostureFocusTimer = null;

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
  state.detailFocusUntil = Date.now() + 3200;
  showKeyOnCurrentPage(id);
  switchTab('keys');
  await loadKeyFailureSummary(id).catch(() => {});
  state.lastOperation = { id, tone: 'good', title: '日志定位', message: '已从请求日志打开密钥 ' + displayLabelById(id) + ' 的详情。可继续查看健康、冷却和最近失败。', time: stamp(Date.now()) };
  renderKeys();
  renderDetails();
  scrollMobileDetailsIntoView();
  focusDetailLogAction();
  showToast('已从日志打开密钥详情。可查看健康/冷却，或返回日志继续定位。');
}

function runKeyWorkflowAction(button) {
  const action = button?.dataset?.keyWorkflowAction || '';
  if (!action || button.disabled) return;
  const restore = setButtonBusy(button, action === 'reset' ? '正在重置筛选' : action === 'selected' ? '正在打开批量' : '正在筛选密钥');
  try {
    if (action === 'reset') {
      const wasFiltered = Boolean(el('keySearch').value.trim()) || state.keyFilter !== 'All';
      clearKeyFilters();
      focusKeyFilterChip('All');
      if (!wasFiltered) showToast('已聚焦全部密钥范围。可继续搜索 ID，或按状态筛选。');
      return;
    }
    if (action === 'selected') {
      const applyBatchFocus = () => {
        const firstAction = el('batchTestSelected') || el('batchEnableSelected') || el('batchBar');
        if (firstAction && typeof firstAction.focus === 'function') firstAction.focus();
      };
      // Double rAF covers batch bar reveal paint; short retry covers selection sync paint.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyBatchFocus();
          setTimeout(applyBatchFocus, 48);
        });
      });
      showToast('已聚焦已选密钥的批量操作。可测试/启用/禁用，或清除选择。');
      return;
    }
    if (action === 'problems') {
      applyProblemKeyFilter();
      showToast('已筛选异常密钥。可批量测试/禁用，或清除筛选恢复全部。');
      return;
    }
    if (action === 'scope') {
      scheduleControlFocus('keySearch', { select: true });
      showToast('已聚焦密钥搜索。可输入 ID 或标签，Enter 后查看匹配项。');
    }
  } finally {
    restore();
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
  const apply = () => {
    const target = el(targetInfo.id);
    if (!target) return false;
    document.querySelectorAll('[data-config-posture-target]').forEach((item) => delete item.dataset.configFocus);
    target.dataset.configFocus = 'true';
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
    clearTimeout(configPostureFocusTimer);
    configPostureFocusTimer = setTimeout(() => {
      if (target.isConnected) delete target.dataset.configFocus;
    }, 3200);
    return true;
  };
  // Double rAF covers audit tab paint; short retry covers delayed layout after switchTab.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const focused = apply();
      if (focused) {
        showToast('已定位' + targetInfo.label + '配置详情。可对照建议调整，或导出审计证据。');
      } else {
        setTimeout(() => {
          if (apply()) showToast('已定位' + targetInfo.label + '配置详情。可对照建议调整，或导出审计证据。');
        }, 48);
      }
    });
  });
}

function focusDetailLogAction() {
  state.detailFocusAction = 'logs';
  state.detailFocusUntil = Date.now() + 3200;
  const apply = () => {
    if (Date.now() > Number(state.detailFocusUntil || 0)) return;
    const detailRoot = window.getComputedStyle(el('mobileDetails')).display === 'none' ? el('detailsBody') : el('mobileDetailsBody');
    const focusTarget = detailRoot?.querySelector('button[data-detail-action="logs"]') || detailRoot?.querySelector('button[data-detail-action]') || detailRoot;
    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
  };
  // Double rAF covers detail re-render after tab/key switch; short retry covers follow-up paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      if (state.detailFocusAction && Date.now() <= Number(state.detailFocusUntil || 0)) {
        setTimeout(apply, 48);
      }
    });
  });
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
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭移动端密钥详情，返回密钥表。可继续点选密钥或批量操作');
  // Return keyboard focus to the table row that opened the panel (or a nearby keys control).
  const applyReturnFocus = () => {
    const body = el('keysBody');
    const selectedId = state.selectedId;
    const row = selectedId && body
      ? Array.from(body.querySelectorAll('tr[data-key-id]')).find((item) => item.dataset.keyId === selectedId)
      : null;
    const rowSelect = row?.querySelector('button[data-action="select"]');
    const fallback = el('keySearch') || document.querySelector('#keyFilterChips .chip');
    const target = rowSelect || fallback;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  };
  // Double rAF covers panel close + table paint; short retry covers a follow-up refresh paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyReturnFocus();
      setTimeout(applyReturnFocus, 48);
    });
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

const { switchTab, renderActiveTab, focusActiveTabControl, switchToCommandTab, focusControlInTab } = createTabs({
  updateSummary,
  renderObservability,
  renderKeys,
  renderDetails,
  renderLogs,
  renderLogTrace,
  renderAudit,
  renderConfigSummary,
  syncTableScrollAffordances
});

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
  { id: 'import-keys', group: '操作', title: '批量导入密钥', description: '打开导入预检面板', chip: '导入', aliases: 'import keys upload 导入 密钥 批量', run: () => { switchTab('keys'); openImportModal({ returnFocus: el('bulkImportBtn') }); } },
  { id: 'refresh-console', group: '操作', title: '刷新控制台', description: '重新同步密钥、日志、审计和配置', chip: '刷新', aliases: 'refresh sync reload 刷新 同步', run: () => el('refresh').click() },
  { id: 'refresh-logs-list', group: '操作', title: '刷新请求日志列表', description: '重新载入当前筛选范围的请求日志窗口', chip: '刷新', aliases: 'refresh logs list reload 刷新 日志 列表', run: () => { switchTab('logs'); el('applyLogFilters').click(); } },
  { id: 'refresh-audit-list', group: '操作', title: '刷新审计列表', description: '重新载入最近管理员审计窗口', chip: '刷新', aliases: 'refresh audit list reload 刷新 审计 列表', run: () => { switchTab('audit'); el('refreshAuditList').click(); } },
  { id: 'test-webhook', group: '操作', title: '测试 Webhook', description: '发送一次告警 Webhook 探测', chip: '测试', aliases: 'webhook alert test 告警 测试', run: () => el('testWebhook').click() },
  { id: 'export-logs', group: '导出', title: '导出请求日志', description: '下载当前日志筛选范围 CSV', chip: 'CSV', aliases: 'export logs csv download 导出 日志', run: () => { switchTab('logs'); el('exportLogs').click(); } },
  { id: 'export-audit', group: '导出', title: '导出审计记录', description: '下载当前审计动作和结果范围 CSV', chip: 'CSV', aliases: 'export audit csv download 导出 审计', run: () => { switchTab('audit'); el('exportAudit').click(); } }
];

const {
  openCommandPalette,
  closeCommandPalette,
  renderCommandPalette,
  handleCommandPaletteKeydown,
  trapCommandPaletteFocus,
  shouldIgnoreCommandShortcut,
  runCommand,
  visibleCommands
} = createCommandPalette({ commandDefinitions });

function focusAlertTarget() {
  // Keep intent long enough for tab switch + SSE/refresh re-renders that replace #alertList buttons.
  state.alertFocusUntil = Date.now() + 3200;
  const applyFocus = () => {
    if (Date.now() > Number(state.alertFocusUntil || 0)) return;
    if (state.activeTab !== 'overview') return;
    const alertTarget = document.querySelector('#alertList button[data-overview-signal-action="alert-focus"]') || el('insightNextActionButton') || el('alertList');
    if (alertTarget && typeof alertTarget.focus === 'function') alertTarget.focus({ preventScroll: true });
  };
  // Double rAF covers overview paint; short retries cover list rebuild after refresh.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyFocus();
      if (state.alertFocusUntil && Date.now() <= Number(state.alertFocusUntil || 0)) {
        window.setTimeout(applyFocus, 48);
        window.setTimeout(applyFocus, 400);
      }
    });
  });
}

async function runOverviewAction(actionId, sourceButton = null) {
  if (!actionId || sourceButton?.disabled) return;
  const shouldMarkBusy = sourceButton && !sourceButton.dataset.overviewSignalAction && actionId !== 'import-keys';
  const restore = shouldMarkBusy ? setButtonBusy(sourceButton, '正在跳转') : () => {};
  try {
    if (actionId === 'import-keys') {
      switchTab('keys');
      openImportModal({ returnFocus: el('bulkImportBtn') });
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

bindImportRefresh(refresh);

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
    state.lastOperation = { id, tone: 'good', title: '详情', message: '已打开密钥 ' + displayLabelById(id) + ' 的详情。可测试/重置冷却，或查看关联请求日志。', time: stamp(Date.now()) };
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
    // Keep intent long enough for API latency + detail re-render + optional follow-up refresh paint.
    state.detailFocusUntil = Date.now() + 3200;
    state.rowFocusKeyId = null;
    state.rowFocusAction = null;
    state.rowFocusUntil = 0;
  }
  try {
    if (action === 'copy') {
      const key = state.keys.find((item) => item.id === id);
      if (!rawKeyDisplayAllowed(key)) {
        state.lastOperation = { id, tone: 'warn', title: '复制', message: '当前环境未开启原始密钥显示。可在顶部安全区开启「显示原文」后再复制，或保持关闭。', time: stamp(Date.now()) };
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
        state.lastOperation = { id, tone: 'bad', title: '复制', message: '剪贴板写入失败。请检查浏览器权限或使用 HTTPS 后重试。', time: stamp(Date.now()) };
        renderDetails();
        showToast('剪贴板写入失败，请检查浏览器权限或使用 HTTPS 后重试。', 'bad');
        return;
      }
      state.lastOperation = { id, tone: 'good', title: '复制', message: '原始密钥已复制到剪贴板，并写入管理员审计。请妥善保管，勿粘贴到不可信环境。', time: stamp(Date.now()) };
      renderDetails();
      showToast('原始密钥已复制。请妥善保管，勿粘贴到不可信环境。');
      return;
    }
    let toastTone = 'good';
    if (action === 'disable') {
      await api('/_proxy/keys/' + encodeURIComponent(id) + '/disable', { method: 'POST' });
      state.lastOperation = { id, tone: 'warn', title: '禁用', message: '密钥 ' + displayLabelById(id) + ' 已禁用，调度器不会继续分配新请求。可在详情重新启用，或继续批量处理。', time: stamp(Date.now()) };
    }
    if (action === 'enable') {
      await api('/_proxy/keys/' + encodeURIComponent(id) + '/enable', { method: 'POST' });
      state.lastOperation = { id, tone: 'good', title: '启用', message: '密钥 ' + displayLabelById(id) + ' 已启用，可重新参与请求调度。可测试连通性，或继续观察健康状态。', time: stamp(Date.now()) };
    }
    if (action === 'reset') {
      await api('/_proxy/keys/' + encodeURIComponent(id) + '/reset-circuit', { method: 'POST' });
      state.lastOperation = { id, tone: 'good', title: '重置', message: '密钥 ' + displayLabelById(id) + ' 的冷却诊断已重置。可刷新状态确认冷却清除，或继续测试该密钥。', time: stamp(Date.now()) };
    }
    if (action === 'test') {
      state.lastOperation = { id, tone: 'warn', title: '测试中', message: '正在使用密钥 ' + displayLabelById(id) + ' 发起上游探测请求。完成后可在详情与审计复核结果。', time: stamp(Date.now()) };
      renderDetails();
      const result = await api('/_proxy/keys/' + encodeURIComponent(id) + '/test', { method: 'POST' });
      const ok = Boolean(result.ok);
      toastTone = ok ? 'good' : 'bad';
      state.lastOperation = { id, tone: ok ? 'good' : 'bad', title: '测试密钥', message: '测试密钥 ' + displayLabelById(id) + ' 完成：状态 ' + (result.status || '-') + '，延迟 ' + ms(result.latencyMs) + '，结果 ' + labelOf(result.reason) + '。' + (ok ? '可继续观察调度，或查看关联请求日志。' : '请检查上游连通性后重试，或到审计查看失败记录。'), time: stamp(Date.now()) };
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

function resetTimer() {
  if (state.timer) clearInterval(state.timer);
  if (!document.querySelector('[data-console-shell]').hidden && el('autoRefresh').checked) state.timer = setInterval(() => { if (!state.eventRefreshPending) refresh().catch(() => {}); }, Math.max(5000, Number(el('refreshInterval').value)));
}

let forceSessionExpired = (message) => {};
const { connectEventStream } = createEventStream({
  refresh,
  isSessionExpiredError,
  forceSessionExpired: (message) => forceSessionExpired(message)
});

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
  scheduleControlFocus('loginButton');
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
    showToast('已打开密钥池。完成导入/测试后可回到审计查看证据，或继续管理密钥。');
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
    scheduleControlFocus('commandSearch');
    showToast('已清空快速操作搜索。可继续输入关键词，或用方向键选择操作。');
    return;
  }
  if (action === 'suggest-keys') {
    el('commandSearch').value = '密钥';
    activeCommandIndex = 0;
    renderCommandPalette();
    scheduleControlFocus('commandSearch');
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
function keyPagerVisibleCount() {
  const query = el('keySearch')?.value?.trim().toLowerCase() || '';
  const filter = state.keyFilter || 'All';
  return state.keys.filter((key) => {
    const status = statusOf(key);
    const problem = status === 'Cooldown' || status === 'Disabled'
      || Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0;
    const matches = key.id.toLowerCase().includes(query) || rawDisplayLabel(key).toLowerCase().includes(query);
    return matches && (filter === 'All' || filter === status || (filter === 'Problem' && problem));
  }).length;
}

function keyPagerMaxPage() {
  return Math.max(1, Math.ceil(keyPagerVisibleCount() / Math.max(1, state.keyPageSize)));
}

function goKeyPage(delta, controlId) {
  const maxPage = keyPagerMaxPage();
  const next = Math.min(Math.max(1, Number(state.keyPage || 1) + delta), maxPage);
  if (next === Number(state.keyPage || 1)) {
    showToast(
      delta < 0
        ? '已在第一页。可跳转到指定页码，或调整每页数量。'
        : '已在最后一页。可跳转到指定页码，或调整每页数量。',
      'warn'
    );
    scheduleControlFocus(controlId);
    return;
  }
  state.keyPage = next;
  renderKeys();
  showToast('已到第 ' + fmt(next) + ' / ' + fmt(maxPage) + ' 页。可继续翻页，或打开密钥详情。');
  scheduleControlFocus(controlId);
}

el('prevKeyPage').addEventListener('click', () => goKeyPage(-1, 'prevKeyPage'));
el('nextKeyPage').addEventListener('click', () => goKeyPage(1, 'nextKeyPage'));
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
      ? '侧栏导航：已收起。点击展开完整导航标签，可按页面名称切换'
      : '侧栏导航：已展开。点击收起为图标导航，可腾出主工作区宽度'
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
  const size = Number(event.target.value) || state.keyPageSize;
  state.keyPageSize = size;
  state.keyPage = 1;
  renderKeys();
  showToast('每页显示 ' + fmt(size) + ' 个密钥。可翻页浏览，或跳转到指定页码。');
  scheduleControlFocus('keyPageSize');
});

// Jump to page (against current filtered key set / page size).
if (el('jumpKeyPage')) el('jumpKeyPage').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const raw = Number(event.target.value);
  const maxPage = keyPagerMaxPage();
  event.target.value = '';
  if (!Number.isFinite(raw) || raw < 1) {
    showToast('请输入有效页码（1-' + fmt(maxPage) + '）。可翻页浏览，或调整每页数量。', 'warn');
    scheduleControlFocus('jumpKeyPage', { select: true });
    return;
  }
  const requested = Math.floor(raw);
  const page = Math.min(Math.max(1, requested), maxPage);
  state.keyPage = page;
  renderKeys();
  if (requested > maxPage) {
    showToast('已跳到最后一页第 ' + fmt(page) + ' 页（共 ' + fmt(maxPage) + ' 页）。可继续翻页或调整每页数量。', 'warn');
  } else {
    showToast('已跳到第 ' + fmt(page) + ' / ' + fmt(maxPage) + ' 页。可继续翻页，或打开密钥详情。');
  }
  scheduleControlFocus('jumpKeyPage', { select: true });
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

const sessionShell = createSessionShell({
  clearToken,
  closeEventStream,
  setLiveLinkStatus,
  switchTab,
  resetTimer,
  connectEventStream,
  state
});
const showLogin = sessionShell.showLogin;
const showConsole = sessionShell.showConsole;
forceSessionExpired = sessionShell.forceSessionExpired;

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
