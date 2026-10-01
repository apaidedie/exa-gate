import { debounce, el } from '../state.js';
import { showErrorToast } from '../ui/toast.js';
import { syncToastLift } from '../ui/toast.js';
import { closeConfirmAction, isConfirmActionOpen, trapConfirmActionFocus } from '../ui/confirm-action.js';
import { syncTableScrollAffordance, syncTableScrollAffordances } from '../ui/table-scroll.js';
import { trapImportFocus, closeImportModal } from '../keys/import.js';

export function bindShellEvents(ctx) {
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

el('pruneLogs').addEventListener('click', () => requestPruneLogsConfirm());
el('timeRange').addEventListener('change', () => refresh().catch((error) => showErrorToast(error)));
document.querySelector('[data-tab-panel="overview"]').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-overview-signal-action], button[data-overview-action]');
  if (!button) return;
  const actionId = button.dataset.overviewSignalAction || button.dataset.overviewAction;
  runOverviewAction(actionId, button).catch((error) => showErrorToast(error));
});
document.addEventListener('keydown', (event) => {
  trapImportFocus(event);
  trapConfirmActionFocus(event);
  trapCommandPaletteFocus(event);
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k' && !shouldIgnoreCommandShortcut(event)) {
    event.preventDefault();
    if (el('commandPalette').hidden) openCommandPalette();
    else closeCommandPalette();
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

// Theme: follows the OS preference until the operator picks one explicitly;
// the choice persists in localStorage and wins over the OS setting.
const themeToggle = el('themeToggle');
const themeStorageKey = 'exaTheme';

function resolvedTheme() {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Persist for the server-side first-paint injection (no light flash).
  document.cookie = 'exaTheme=' + theme + '; path=/; max-age=31536000; samesite=lax';
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
    themeToggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  }
}

if (themeToggle) {
  applyTheme(resolvedTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!localStorage.getItem(themeStorageKey)) applyTheme(event.matches ? 'dark' : 'light');
  });
  themeToggle.addEventListener('click', () => {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(themeStorageKey, next);
    applyTheme(next);
  });
}

// Primary tab navigation; desktop sidebar and mobile rail share the same tab state.
document.querySelectorAll('[data-tab-nav]').forEach((nav) => {
  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('.nav-item[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });
});

bindSidebarCollapse();
window.addEventListener('resize', () => syncToastLift());
}
