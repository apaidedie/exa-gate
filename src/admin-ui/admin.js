import { api, clearToken, currentSessionId, fetchConfigSummary, fetchLogs, fetchObservability, verifyAdminToken, verifyStoredSession } from './api.js';
import { debounce, el, fmt, loginToken, state, token } from './state.js';
import { renderDetails, renderKeys, syncSecretToggleState, updateSummary } from './renderKeys.js';
import { renderAudit, renderLogTrace, renderLogs } from './renderLogs.js';
import { renderConfigSummary, renderObservability } from './renderObservability.js';
import { showErrorToast, showToast, syncToastLift } from './ui/toast.js';
import { setButtonPending } from './ui/busy.js';
import { scheduleControlFocus } from './ui/focus.js';
import { acceptConfirmAction, closeConfirmAction, isConfirmActionOpen, trapConfirmActionFocus } from './ui/confirm-action.js';
import { syncTableScrollAffordance, syncTableScrollAffordances } from './ui/table-scroll.js';
import { setLiveLinkStatus, setRefreshStatus, updateLastUpdated } from './live/refresh.js';
import { closeEventStream, createEventStream } from './live/events.js';
import { createSessionShell, isSessionExpiredError, setLoginError, syncLoginCapsHint, syncLoginTokenDescribedBy } from './session/auth-ui.js';
import { createTabs } from './nav/tabs.js';
import { createCommandPalette } from './command/palette.js';
import {
  clearLogFilters,
  loadLogTrace,
  reloadLogs,
  removeLogFilterDimension,
  runLogDiagnosticAction
} from './logs/actions.js';
import {
  clearKeyFilters,
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
import { createKeysOps } from './keys/ops.js';
import { createOverviewActions } from './overview/actions.js';
import { createConsoleOps } from './console/ops.js';
import {
  clearAuditFilters,
  reloadAudit,
  removeAuditFilterDimension,
  runAuditEvidenceAction
} from './audit/actions.js';

let refreshInFlight = null;

const keysDeps = {
  refresh: async () => {},
  switchTab: () => {},
  focusControlInTab: () => {}
};
const overviewDeps = {
  switchTab: () => {},
  focusControlInTab: () => {}
};
const consoleDeps = {
  refresh: async () => {},
  switchTab: () => {}
};

const {
  updateBatchBar,
  clearBatchSelection,
  applyKeySort,
  requestBatchDisableConfirm,
  loadKeyFailureSummary,
  closeMobileDetailsPanel,
  openKeyDetailFromLog,
  runKeyWorkflowAction,
  batchKeyAction,
  keyAction,
  keyPagerMaxPage,
  goKeyPage,
  runKeyEmptyAction
} = createKeysOps(keysDeps);

const { runOverviewAction } = createOverviewActions(overviewDeps);
const {
  requestPruneLogsConfirm,
  testWebhook,
  focusConfigPosture,
  copyReadinessCommand,
  runExportLogs,
  runExportAudit,
  syncAutoRefreshAria,
  bindSidebarCollapse
} = createConsoleOps(consoleDeps);

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

keysDeps.switchTab = switchTab;
keysDeps.focusControlInTab = focusControlInTab;
overviewDeps.switchTab = switchTab;
overviewDeps.focusControlInTab = focusControlInTab;
consoleDeps.switchTab = switchTab;

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
  visibleCommands,
  setActiveCommand,
  resetActiveCommandIndex
} = createCommandPalette({ commandDefinitions });



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
keysDeps.refresh = refresh;
consoleDeps.refresh = refresh;

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
el('commandSearch').addEventListener('input', () => { resetActiveCommandIndex(); renderCommandPalette(); });
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
    resetActiveCommandIndex();
    renderCommandPalette();
    scheduleControlFocus('commandSearch');
    showToast('已清空快速操作搜索。可继续输入关键词，或用方向键选择操作。');
    return;
  }
  if (action === 'suggest-keys') {
    el('commandSearch').value = '密钥';
    resetActiveCommandIndex();
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
el('prevKeyPage').addEventListener('click', () => goKeyPage(-1, 'prevKeyPage'));
el('nextKeyPage').addEventListener('click', () => goKeyPage(1, 'nextKeyPage'));
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

bindSidebarCollapse();

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

