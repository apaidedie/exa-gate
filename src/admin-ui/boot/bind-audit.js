import { debounce, el } from '../state.js';
import { renderAudit } from '../renderLogs.js';
import { showErrorToast, showToast } from '../ui/toast.js';
import {
  clearAuditFilters,
  reloadAudit,
  removeAuditFilterDimension,
  runAuditEvidenceAction
} from '../audit/actions.js';

export function bindAuditEvents(ctx) {
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

el('exportAudit').addEventListener('click', () => runExportAudit().catch((error) => showErrorToast(error)));

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
}
