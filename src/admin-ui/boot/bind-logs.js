import { debounce, el, state } from '../state.js';
import { renderLogs } from '../renderLogs.js';
import { showErrorToast, showToast } from '../ui/toast.js';
import {
  clearLogFilters,
  loadLogTrace,
  reloadLogs,
  removeLogFilterDimension,
  runLogDiagnosticAction
} from '../logs/actions.js';

export function bindLogEvents(ctx) {
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
el('exportLogs').addEventListener('click', () => runExportLogs().catch((error) => showErrorToast(error)));

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
}
