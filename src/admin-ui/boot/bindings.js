import { api, clearToken, verifyAdminToken } from '../api.js';
import { debounce, el, fmt, loginToken, state, token } from '../state.js';
import { renderDetails, renderKeys, syncSecretToggleState } from '../renderKeys.js';
import { renderAudit, renderLogs } from '../renderLogs.js';
import { showErrorToast, showToast, syncToastLift } from '../ui/toast.js';
import { setButtonPending } from '../ui/busy.js';
import { scheduleControlFocus } from '../ui/focus.js';
import { acceptConfirmAction, closeConfirmAction, isConfirmActionOpen, trapConfirmActionFocus } from '../ui/confirm-action.js';
import { syncTableScrollAffordance, syncTableScrollAffordances } from '../ui/table-scroll.js';
import { closeEventStream } from '../live/events.js';
import { setLoginError, syncLoginCapsHint, syncLoginTokenDescribedBy } from '../session/auth-ui.js';
import {
  clearLogFilters,
  loadLogTrace,
  reloadLogs,
  removeLogFilterDimension,
  runLogDiagnosticAction
} from '../logs/actions.js';
import {
  clearKeyFilters,
  removeKeyFilterDimension
} from '../keys/actions.js';
import {
  closeImportModal,
  openImportModal,
  readImportFile,
  submitImport,
  trapImportFocus,
  updateImportPreview
} from '../keys/import.js';
import {
  clearAuditFilters,
  reloadAudit,
  removeAuditFilterDimension,
  runAuditEvidenceAction
} from '../audit/actions.js';

export function bindConsoleEvents(ctx) {
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

}
