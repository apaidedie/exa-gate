import { debounce, el, fmt, state } from '../state.js';
import { renderDetails, renderKeys, syncSecretToggleState } from '../renderKeys.js';
import { showErrorToast, showToast } from '../ui/toast.js';
import { scheduleControlFocus } from '../ui/focus.js';
import { clearKeyFilters, removeKeyFilterDimension } from '../keys/actions.js';

export function bindKeyEvents(ctx) {
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

el('keySearch').addEventListener('input', debounce(() => { state.keyPage = 1; renderKeys(); }, 250));
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
el('batchTestPage').addEventListener('click', () => batchKeyAction('test', state.pageKeyIds).catch((error) => showErrorToast(error)));
el('batchDisableProblems').addEventListener('click', () => requestBatchDisableConfirm(state.problemKeyIds, 'problems'));
const densityToggle = el('keysDensityToggle');
if (densityToggle) {
  densityToggle.addEventListener('click', () => {
    const panel = document.querySelector('.keys-panel');
    if (!(panel instanceof HTMLElement)) return;
    const compact = panel.getAttribute('data-density') !== 'full';
    panel.setAttribute('data-density', compact ? 'full' : 'compact');
    densityToggle.setAttribute('aria-pressed', compact ? 'false' : 'true');
    densityToggle.textContent = compact ? '紧凑列' : '展开指标';
    densityToggle.setAttribute(
      'aria-label',
      compact
        ? '表格密度：完整。点击收起成功/失败/429/超时列'
        : '表格密度：紧凑。点击展开成功/失败/429/超时列'
    );
  });
}
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
document.querySelectorAll('.detail-body-target').forEach((detailBody) => {
  detailBody.addEventListener('click', (event) => {
    const emptyAction = event.target.closest('button[data-empty-action]');
    if (emptyAction && runKeyEmptyAction(emptyAction.dataset.emptyAction || '')) return;
    const button = event.target.closest('button[data-detail-action]');
    if (!button || !state.selectedId) return;
    keyAction(state.selectedId, button.dataset.detailAction, button).catch((error) => showErrorToast(error));
  });
});
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
}
