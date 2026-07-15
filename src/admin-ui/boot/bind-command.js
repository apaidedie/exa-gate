import { el } from '../state.js';
import { showToast } from '../ui/toast.js';
import { scheduleControlFocus } from '../ui/focus.js';

export function bindCommandEvents(ctx) {
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
}
