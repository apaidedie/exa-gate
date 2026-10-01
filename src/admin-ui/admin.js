import { api, clearToken, currentSessionId, fetchConfigSummary, fetchLogs, fetchObservability, verifyAdminToken, verifyStoredSession } from './api.js';
import { el, state, token } from './state.js';
import { renderDetails, renderKeys, syncSecretToggleState, updateSummary } from './renderKeys.js';
import { renderLogTrace, renderLogs } from './renderLogs.js';
import { renderObservability } from './renderObservability.js';
import { showErrorToast } from './ui/toast.js';
import { setButtonPending } from './ui/busy.js';
import { syncTableScrollAffordances } from './ui/table-scroll.js';
import { renderVersionStatus, setLiveLinkStatus, setRefreshStatus, updateLastUpdated } from './live/refresh.js';
import { closeEventStream, createEventStream } from './live/events.js';
import { createSessionShell, isSessionExpiredError } from './session/auth-ui.js';
import { createTabs } from './nav/tabs.js';
import { createCommandPalette } from './command/palette.js';
import { clearLogFilters } from './logs/actions.js';
import { clearKeyFilters } from './keys/actions.js';
import { bindImportRefresh, openImportModal } from './keys/import.js';
import { createKeysOps } from './keys/ops.js';
import { createOverviewActions } from './overview/actions.js';
import { createConsoleOps } from './console/ops.js';
import { bindConsoleEvents } from './boot/bindings.js';

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
  requestBatchDeleteConfirm,
  loadKeyFailureSummary,
  closeMobileDetailsPanel,
  openKeyDetailFromLog,
  runKeyWorkflowAction,
  batchKeyAction,
  selectAllMatchingKeys,
  requestExportKeysConfirm,
  requestDeadKeyCleanup,
  keyAction,
  keyPagerMaxPage,
  goKeyPage,
  runKeyEmptyAction
} = createKeysOps(keysDeps);

const { runOverviewAction } = createOverviewActions(overviewDeps);
const {
  requestPruneLogsConfirm,
  testWebhook,
  runExportLogs,
  syncAutoRefreshAria,
  bindSidebarCollapse
} = createConsoleOps(consoleDeps);

const { switchTab, renderActiveTab, switchToCommandTab, focusControlInTab } = createTabs({
  updateSummary,
  renderObservability,
  renderKeys,
  renderDetails,
  renderLogs,
  renderLogTrace,
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
  { id: 'focus-key-search', group: '筛选', title: '搜索密钥', description: '跳转到密钥池并聚焦搜索框', chip: '焦点', aliases: 'keys search filter key 密钥 搜索 筛选', run: () => focusControlInTab('keys', 'keySearch') },
  { id: 'focus-log-search', group: '筛选', title: '搜索请求日志', description: '跳转到请求日志并聚焦关键词搜索', chip: '焦点', aliases: 'logs search filter request 日志 搜索 筛选', run: () => focusControlInTab('logs', 'logSearch') },
  { id: 'clear-key-filters', group: '筛选', title: '清除密钥筛选', description: '恢复全部密钥和第一页', chip: '清除', aliases: 'clear reset keys filters 清除 重置 密钥 筛选', run: () => { switchTab('keys'); clearKeyFilters(); } },
  { id: 'clear-log-filters', group: '筛选', title: '清除日志筛选', description: '恢复最近请求日志并清空链路选择', chip: '清除', aliases: 'clear reset logs filters 清除 重置 日志 筛选', run: () => { switchTab('logs'); clearLogFilters().catch((error) => showErrorToast(error)); } },
  { id: 'import-keys', group: '操作', title: '批量导入密钥', description: '打开导入预检面板', chip: '导入', aliases: 'import keys upload 导入 密钥 批量', run: () => { switchTab('keys'); openImportModal({ returnFocus: el('bulkImportBtn') }); } },
  { id: 'export-keys', group: '操作', title: '导出密钥备份', description: '下载全部密钥的 id:key:weight 明文备份', chip: '备份', aliases: 'export keys backup download 导出 密钥 备份', run: () => { switchTab('keys'); el('exportKeysBtn').click(); } },
  { id: 'refresh-console', group: '操作', title: '刷新控制台', description: '重新同步密钥、日志和配置', chip: '刷新', aliases: 'refresh sync reload 刷新 同步', run: () => el('refresh').click() },
  { id: 'refresh-logs-list', group: '操作', title: '刷新请求日志列表', description: '重新载入当前筛选范围的请求日志窗口', chip: '刷新', aliases: 'refresh logs list reload 刷新 日志 列表', run: () => { switchTab('logs'); el('applyLogFilters').click(); } },
  { id: 'test-webhook', group: '操作', title: '测试 Webhook', description: '发送一次告警 Webhook 探测', chip: '测试', aliases: 'webhook alert test 告警 测试', run: () => el('testWebhook').click() },
  { id: 'export-logs', group: '导出', title: '导出请求日志', description: '下载当前日志筛选范围 CSV', chip: 'CSV', aliases: 'export logs csv download 导出 日志', run: () => { switchTab('logs'); el('exportLogs').click(); } }
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
  // silent: auto-refresh / SSE — no button busy, no full-page skeleton
  // blockUi: only first paint (or explicit) greys the shell
  const silent = options.silent === true;
  const shell = document.querySelector('[data-console-shell]');
  const hydrated = shell instanceof HTMLElement && shell.hasAttribute('data-console-hydrated');
  const blockUi = options.blockUi === true || (!silent && !hydrated);
  const refreshButton = el('refresh');
  const restoreRefresh = silent ? () => {} : setButtonPending(refreshButton, '正在刷新');
  setRefreshStatus('syncing', '', { blockUi, quiet: silent });
  refreshInFlight = (async () => {
    try {
      const [keyData, logData, observabilityData, configData] = await Promise.all([
        api('/_proxy/keys'),
        fetchLogs(),
        fetchObservability(),
        fetchConfigSummary()
      ]);
      state.keys = keyData.keys || [];
      state.logs = logData.logs || [];
      state.observability = observabilityData;
      state.config = configData || null;
      renderVersionStatus(configData?.version);
      updateSummary();
      renderActiveTab(state.activeTab);
      if (state.activeTab === 'keys' && state.selectedId) await loadKeyFailureSummary(state.selectedId).catch(() => {});
      if (state.activeTab === 'keys') renderDetails();
      if (shell instanceof HTMLElement) shell.setAttribute('data-console-hydrated', '');
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
  if (!document.querySelector('[data-console-shell]').hidden && el('autoRefresh').checked) state.timer = setInterval(() => { if (!state.eventRefreshPending) refresh({ silent: true }).catch(() => {}); }, Math.max(5000, Number(el('refreshInterval').value)));
}

let forceSessionExpired = (message) => {};
const { connectEventStream } = createEventStream({
  refresh,
  isSessionExpiredError,
  forceSessionExpired: (message) => forceSessionExpired(message)
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

bindConsoleEvents({
  refresh,
  resetTimer,
  showLogin,
  showConsole,
  switchTab,
  focusControlInTab,
  runOverviewAction,
  requestPruneLogsConfirm,
  testWebhook,
  runExportLogs,
  syncAutoRefreshAria,
  bindSidebarCollapse,
  updateBatchBar,
  clearBatchSelection,
  applyKeySort,
  requestBatchDisableConfirm,
  requestBatchDeleteConfirm,
  closeMobileDetailsPanel,
  openKeyDetailFromLog,
  runKeyWorkflowAction,
  batchKeyAction,
  selectAllMatchingKeys,
  requestExportKeysConfirm,
  requestDeadKeyCleanup,
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
