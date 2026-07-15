import { api, fetchKeyFailureSummary } from '../api.js';
import { displayLabelById, el, fmt, labelOf, ms, rawDisplayLabel, rawKeyDisplayAllowed, stamp, state, statusOf } from '../state.js';
import { renderDetails, renderKeys, showKeyOnCurrentPage, syncSelectAllKeysControl, updateKeyWorkflowSelection } from '../renderKeys.js';
import { showErrorToast, showToast, syncToastLift } from '../ui/toast.js';
import { setButtonBusy, setButtonPending } from '../ui/busy.js';
import { scheduleControlFocus } from '../ui/focus.js';
import { openConfirmAction } from '../ui/confirm-action.js';
import { applyLogKeyFilter } from '../logs/actions.js';
import { applyProblemKeyFilter, clearKeyFilters, focusKeyFilterChip } from './actions.js';
import { openImportModal } from './import.js';

export function createKeysOps(deps) {
  const refresh = (options) => deps.refresh(options);
  const switchTab = (tab) => deps.switchTab(tab);
  const focusControlInTab = (tab, controlId) => deps.focusControlInTab(tab, controlId);

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

  async function loadKeyFailureSummary(id) {
    if (!id) return;
    const result = await fetchKeyFailureSummary(id);
    state.keyFailures[id] = result.summary;
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

  return {
    updateBatchBar,
    clearBatchSelection,
    applyKeySort,
    requestBatchDisableConfirm,
    loadKeyFailureSummary,
    scrollMobileDetailsIntoView,
    closeMobileDetailsPanel,
    focusDetailLogAction,
    openKeyDetailFromLog,
    runKeyWorkflowAction,
    batchKeyAction,
    keyAction,
    keyPagerVisibleCount,
    keyPagerMaxPage,
    goKeyPage,
    runKeyEmptyAction
  };
}
