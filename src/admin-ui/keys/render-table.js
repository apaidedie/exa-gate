import { classForStatus, cooldownLeft, displayLabel, el, esc, fmt, observedRequestsFor, pct, rawDisplayLabel, state, statusOf, statusText } from '../state.js';
import { filterChipMarkup, keyFilterState, keyRowSignal, keySortAriaLabel, sortKeyRows } from './render-shared.js';
import { renderKeyWorkflowSummary } from './render-workflow.js';
import {
  renderDetails,
  renderKeyFilteredDetailEmpty,
  renderKeyFirstRunDetailEmpty,
  setDetailBodies,
  syncMobileDetailsPanel,
  syncRowFocusIntent
} from './render-details.js';

export function syncSecretToggleState() {
  const button = el('toggleSecretDisplay');
  if (!button) return;
  const showingPlain = state.secretDisplay === 'plain';
  button.textContent = showingPlain ? '隐藏原文' : '显示原文';
  button.setAttribute('aria-pressed', String(showingPlain));
  button.classList.toggle('is-plain', showingPlain);
  button.setAttribute(
    'aria-label',
    showingPlain
      ? '密钥显示方式：原文。点击切换为脱敏显示，可保护密钥后再继续运维'
      : '密钥显示方式：脱敏。点击切换为显示原文，可复制前先确认环境安全'
  );
}

export function syncSelectAllKeysControl() {
  const selectAll = el('selectAllKeys');
  if (!selectAll) return;
  const pageIds = Array.isArray(state.pageKeyIds) ? state.pageKeyIds : [];
  const selected = new Set(state.selectedKeyIds || []);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const totalOnPage = pageIds.length;
  const allSelected = totalOnPage > 0 && selectedOnPage === totalOnPage;
  const someSelected = selectedOnPage > 0 && selectedOnPage < totalOnPage;
  selectAll.checked = allSelected;
  selectAll.indeterminate = someSelected;
  selectAll.setAttribute('aria-checked', someSelected ? 'mixed' : String(allSelected));
  if (allSelected) {
    selectAll.setAttribute('aria-label', '取消选择当前页全部密钥（已选 ' + fmt(selectedOnPage) + ' 个）。取消后可重新勾选');
  } else if (someSelected) {
    selectAll.setAttribute('aria-label', '当前页部分已选 ' + fmt(selectedOnPage) + ' / ' + fmt(totalOnPage) + '。点击选择当前页全部密钥后可批量操作');
  } else {
    selectAll.setAttribute('aria-label', '选择当前页全部密钥。勾选后可使用批量操作栏');
  }
}

function renderKeyFilterSummary({ rows, filter, query }) {
  const summary = el('keyFilterSummary');
  if (!summary) return;
  const filterState = keyFilterState(filter, query);
  const chips = el('keyFilterSummaryChips');
  const text = el('keyFilterSummaryText');
  const clearButton = el('clearKeyFilters');
  const summaryText = filterState.active
    ? '匹配 ' + fmt(rows.length) + ' 个密钥 · 批量作用于当前页'
    : '全部密钥 · 可按关键词或状态收窄';
  const summaryNext = filterState.active
    ? (rows.length ? '可继续批量操作或清除筛选' : '可清除筛选或调整关键词/状态')
    : '可搜索 ID 或按状态筛选';
  summary.classList.toggle('is-empty', !filterState.active);
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  summary.setAttribute('aria-label', '密钥筛选状态：' + summaryText + '。' + summaryNext);
  if (text) text.textContent = summaryText;
  if (chips) {
    chips.innerHTML = filterState.active
      ? filterState.filters.map((item) => filterChipMarkup('key', item)).join('')
      : '<span class="key-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filterState.active;
}

function renderKeyFilteredEmptyState(filter, query) {
  const filterState = keyFilterState(filter, query);
  const activeChips = filterState.filters.map((item) => item.label + ' · ' + item.value);
  const chips = activeChips.length
    ? activeChips
    : ['检查筛选', '清除筛选', '刷新密钥'];
  const hint = filterState.filters.length
    ? filterState.filters.map((item) => item.label + ' “' + item.value + '”').join('，')
    : '当前筛选条件';
  return '<div class="key-empty-state filtered"><div class="empty-kicker" aria-hidden="true">筛选结果</div><h3>没有匹配的密钥</h3><p>' + esc(hint) + ' 没有命中密钥。可一键清除筛选，或调整关键词与状态条件后继续管理密钥池。</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="clear-filters" aria-label="清除密钥池筛选，恢复全部密钥。可继续搜索 ID 或按状态筛选">清除筛选</button><span>恢复全部密钥列表</span></div></div>';
}

function syncKeySortHeaders() {
  document.querySelectorAll('.key-table-scroll th.sortable').forEach((th) => {
    const direction = state.keySort.direction === 'desc' ? 'desc' : 'asc';
    const isActive = th.dataset.sort === state.keySort.column;
    const button = th.querySelector('.sort-btn[data-sort]');
    th.classList.toggle('sort-asc', isActive && direction === 'asc');
    th.classList.toggle('sort-desc', isActive && direction === 'desc');
    th.setAttribute('aria-sort', isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none');
    if (!button) return;
    const label = button.dataset.sortLabel || button.textContent.trim();
    button.setAttribute('aria-pressed', String(isActive));
    button.setAttribute('aria-label', keySortAriaLabel(label, isActive, direction));
  });
}

export function renderKeys() {
  const query = el('keySearch').value.trim().toLowerCase();
  const filter = state.keyFilter || 'All';
  syncSecretToggleState();

  // Compute chip counts across all keys
  let healthyCount = 0, cooldownCount = 0, disabledCount = 0, problemCount = 0;
  const matchesKeyQuery = (key) => key.id.toLowerCase().includes(query) || rawDisplayLabel(key).toLowerCase().includes(query);
  const rows = state.keys.filter((key) => {
    const status = statusOf(key);
    const problem = status === 'Cooldown' || status === 'Disabled' || Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0;
    key._problem = problem;
    if (status === 'Healthy') healthyCount++;
    else if (status === 'Cooldown') cooldownCount++;
    else if (status === 'Disabled') disabledCount++;
    if (problem) problemCount++;
    return matchesKeyQuery(key) && (filter === 'All' || filter === status || (filter === 'Problem' && problem));
  });

  // Update chip counts, active state, and accessible pressed labels
  const chipCounts = { All: state.keys.length, Healthy: healthyCount, Cooldown: cooldownCount, Disabled: disabledCount, Problem: problemCount };
  const chipFilterLabels = {
    All: '全部密钥',
    Healthy: '健康密钥',
    Cooldown: '冷却中密钥',
    Disabled: '已禁用密钥',
    Problem: '异常密钥'
  };
  document.querySelectorAll('#keyFilterChips .chip').forEach((chip) => {
    const value = chip.dataset.chip;
    const selected = value === filter;
    const count = chipCounts[value] || 0;
    const label = chipFilterLabels[value] || value;
    chip.classList.toggle('active', selected);
    chip.setAttribute('aria-pressed', String(selected));
    chip.setAttribute(
      'aria-label',
      selected
        ? ('当前筛选：' + label + '，' + count + ' 个。可切换其他状态或清除筛选')
        : ('筛选' + label + '，' + count + ' 个。点击后收窄密钥表')
    );
    const countSpan = chip.querySelector('.chip-count');
    if (countSpan) {
      countSpan.textContent = String(count);
      countSpan.setAttribute('aria-hidden', 'true');
    }
  });

  // Apply sorting
  sortKeyRows(rows);

  syncKeySortHeaders();

  state.problemKeyIds = rows.filter((key) => key._problem).map((key) => key.id);
  const totalPages = Math.max(1, Math.ceil(rows.length / state.keyPageSize));
  state.keyPage = Math.min(Math.max(1, state.keyPage), totalPages);
  const start = (state.keyPage - 1) * state.keyPageSize;
  const pageRows = rows.slice(start, start + state.keyPageSize);
  state.pageKeyIds = pageRows.map((key) => key.id);
  const visibleProblemCount = state.keys.filter((key) => key._problem && matchesKeyQuery(key)).length;
  if (pageRows.length && !state.pageKeyIds.includes(state.selectedId)) {
    const cooling = pageRows.find((item) => statusOf(item) === 'Cooldown');
    state.selectedId = (cooling || pageRows[0]).id;
  }
  renderKeyWorkflowSummary({ rows, pageRows, problemCount: visibleProblemCount, filter, query, totalPages, start });
  renderKeyFilterSummary({ rows, filter, query });
  const keyPagerText = '显示 ' + fmt(rows.length ? start + 1 : 0) + '-' + fmt(start + pageRows.length) + ' / ' + fmt(rows.length) + ' 个密钥';
  const keyPageLabelText = '第 ' + fmt(state.keyPage) + ' / ' + fmt(totalPages) + ' 页';
  const keyPagerEl = el('keyPager');
  if (keyPagerEl) {
    const pagerNext = rows.length
      ? (totalPages > 1 ? '可用上一页/下一页浏览密钥' : '当前范围仅一页')
      : '可清除筛选或导入密钥';
    keyPagerEl.textContent = keyPagerText;
    keyPagerEl.setAttribute('role', 'status');
    keyPagerEl.setAttribute('aria-live', 'polite');
    keyPagerEl.setAttribute('aria-atomic', 'true');
    keyPagerEl.setAttribute('aria-label', '密钥分页：' + keyPagerText + '。' + pagerNext);
  }
  const keyPageLabelEl = el('keyPageLabel');
  if (keyPageLabelEl) {
    const pageNext = totalPages > 1 ? '可切换页码继续浏览' : '当前仅一页';
    keyPageLabelEl.textContent = keyPageLabelText;
    keyPageLabelEl.setAttribute('role', 'status');
    keyPageLabelEl.setAttribute('aria-live', 'polite');
    keyPageLabelEl.setAttribute('aria-atomic', 'true');
    keyPageLabelEl.setAttribute('aria-label', '密钥页码：' + keyPageLabelText + '。' + pageNext);
  }
  const prevPage = el('prevKeyPage');
  const nextPage = el('nextKeyPage');
  if (prevPage) {
    prevPage.disabled = state.keyPage <= 1;
    prevPage.setAttribute(
      'aria-label',
      state.keyPage <= 1
        ? '密钥池上一页不可用。已在第一页，可跳转到指定页码或调整每页数量'
        : ('密钥池上一页。可前往第 ' + fmt(state.keyPage - 1) + ' 页，或跳转到指定页码')
    );
  }
  if (nextPage) {
    nextPage.disabled = state.keyPage >= totalPages;
    nextPage.setAttribute(
      'aria-label',
      state.keyPage >= totalPages
        ? '密钥池下一页不可用。已在最后一页，可跳转到指定页码或调整每页数量'
        : ('密钥池下一页。可前往第 ' + fmt(state.keyPage + 1) + ' 页，或跳转到指定页码')
    );
  }
  if (!rows.length) {
    state.mobileDetailsOpen = false;
    el('keysBody').innerHTML = state.keys.length === 0
      ? '<tr><td colspan="11" class="empty empty-onboarding"><div class="first-run-empty"><div class="empty-kicker" aria-hidden="true">首次配置</div><h3>还没有可调度的 Exa Key</h3><p>导入至少一把上游 Key 后，代理才会开始处理客户端请求。密钥会写入本地状态库，并按当前加密策略保存。</p><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="import" aria-label="打开批量导入密钥。可粘贴或选择文件后预检再提交">批量导入密钥</button><span>支持每行一个 Key 或 <code>id:key:weight</code></span></div></div></td></tr>'
      : '<tr><td colspan="11" class="empty key-empty-cell">' + renderKeyFilteredEmptyState(filter, query) + '</td></tr>';
    setDetailBodies(state.keys.length === 0
      ? renderKeyFirstRunDetailEmpty()
      : renderKeyFilteredDetailEmpty());
    syncMobileDetailsPanel();
    return;
  }
  el('keysBody').innerHTML = pageRows.map((key) => {
    const status = statusOf(key);
    const observedRequests = observedRequestsFor(key);
    const success = pct(key.successCount, observedRequests);
    const selected = key.id === state.selectedId ? ' class="selected"' : '';
    const checked = state.selectedKeyIds.includes(key.id) ? ' checked' : '';
    const keyLabel = displayLabel(key);
    const signal = keyRowSignal(key, status, observedRequests);
    const signalNext = signal.label === '已停用'
      ? '可启用后恢复调度'
      : signal.label === '冷却中'
        ? '可重置冷却后继续观察'
        : signal.label === '429 压力'
          ? '可筛选 429 日志并评估密钥'
          : signal.label === '超时压力' || signal.label === '失败信号'
            ? '可打开详情并测试连通性'
            : signal.label === '待命' || signal.label === '待样本'
              ? '可测试密钥或等待请求样本'
              : '可打开详情复核调度状态';
    const signalAria = '密钥 ' + keyLabel + ' 状态信号：' + signal.label + '，' + signal.detail + '。' + signalNext;
    const signalTitle = signal.label + '：' + signal.detail + '。' + signalNext;
    const metricNext = Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0
      ? '可打开详情并测试连通性'
      : observedRequests
        ? '可打开详情复核调度状态'
        : '可测试密钥或等待请求样本';
    return '<tr data-key-id="' + esc(key.id) + '"' + selected + '>' +
      '<td class="col-check"><input type="checkbox" class="key-checkbox" data-key-check="' + esc(key.id) + '" aria-label="选择密钥 ' + esc(keyLabel) + '。勾选后可批量操作"' + checked + '></td>' +
      '<td class="mono" aria-label="密钥 ID：' + esc(keyLabel) + '。可打开详情复核用量与操作">' + esc(keyLabel) + '</td>' +
      '<td><button class="toggle ' + (key.enabled ? 'on' : '') + '" data-action="toggle" aria-label="切换密钥 ' + esc(keyLabel) + ' 启用状态。当前' + (key.enabled ? '已启用，点击禁用后可继续测试或查看日志' : '已禁用，点击启用后可继续测试或查看日志') + '" aria-pressed="' + (key.enabled ? 'true' : 'false') + '"></button></td>' +
      '<td class="key-signal-cell"><span class="key-row-signal ' + esc(signal.tone) + '" role="status" aria-label="' + esc(signalAria) + '" title="' + esc(signalTitle) + '"><strong>' + esc(signal.label) + '</strong><small>' + esc(signal.detail) + '</small></span></td>' +
      '<td class="col-metric ' + (observedRequests ? '' : 'metric-zero') + '" aria-label="密钥 ' + esc(keyLabel) + ' 请求数：' + fmt(observedRequests) + '。' + metricNext + '">' + fmt(observedRequests) + '</td>' +
      '<td class="col-metric col-metric-extra ' + (observedRequests ? 'good' : 'metric-zero') + '" aria-label="密钥 ' + esc(keyLabel) + ' 成功率：' + success + '。' + metricNext + '">' + success + '</td>' +
      '<td class="col-metric col-metric-extra ' + (Number(key.failureCount || 0) > 0 ? 'bad' : 'metric-zero') + '" aria-label="密钥 ' + esc(keyLabel) + ' 失败数：' + fmt(key.failureCount) + '。' + (Number(key.failureCount || 0) > 0 ? '可打开详情并测试连通性' : '可继续观察调度') + '">' + fmt(key.failureCount) + '</td>' +
      '<td class="col-metric col-metric-extra ' + (Number(key.rateLimitCount || 0) > 0 ? 'warn' : 'metric-zero') + '" aria-label="密钥 ' + esc(keyLabel) + ' 429 次数：' + fmt(key.rateLimitCount) + '。' + (Number(key.rateLimitCount || 0) > 0 ? '可筛选 429 日志并评估密钥' : '可继续观察调度') + '">' + fmt(key.rateLimitCount) + '</td>' +
      '<td class="col-metric col-metric-extra ' + (Number(key.timeoutCount || 0) > 0 ? '' : 'metric-zero') + '" aria-label="密钥 ' + esc(keyLabel) + ' 超时次数：' + fmt(key.timeoutCount) + '。' + (Number(key.timeoutCount || 0) > 0 ? '可打开详情并测试连通性' : '可继续观察调度') + '">' + fmt(key.timeoutCount) + '</td>' +
      '<td><span class="badge ' + classForStatus(status) + '" aria-label="密钥 ' + esc(keyLabel) + ' 调度状态：' + esc(status === 'Cooldown' ? ('冷却中，剩余 ' + cooldownLeft(key.cooldownUntil)) : statusText[status]) + '。' + esc(signalNext) + '">' + (status === 'Cooldown' ? cooldownLeft(key.cooldownUntil) : statusText[status]) + '</span></td>' +
      '<td class="action-cell"><button class="mini-btn" data-action="select" title="查看详情，可在侧栏复核用量与操作" aria-label="查看密钥 ' + esc(keyLabel) + ' 详情。可在侧栏复核用量与操作">详情</button><button class="mini-btn" data-action="reset" title="重置冷却，可恢复调度后继续观察" aria-label="重置密钥 ' + esc(keyLabel) + ' 冷却。可恢复调度后继续观察">重置</button><button class="mini-btn primary-mini" data-action="test" title="测试密钥，结果会写入审计并可在详情复核" aria-label="测试密钥 ' + esc(keyLabel) + '。结果会写入审计并可在详情复核">测试</button></td>' +
    '</tr>';
  }).join('');
  renderDetails();
  syncRowFocusIntent();
  syncSelectAllKeysControl();
}

export function showKeyOnCurrentPage(id) {
  if (!id || !state.keys.some((key) => key.id === id)) return false;
  const rows = sortKeyRows(state.keys.slice());
  const index = rows.findIndex((key) => key.id === id);
  if (index < 0) return false;
  state.keyPage = Math.floor(index / state.keyPageSize) + 1;
  return true;
}
