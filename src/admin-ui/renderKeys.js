import { classForStatus, computeTotals, cooldownLeft, displayLabel, displayLabelById, el, esc, fmt, isOperationalLog, labelOf, ms, observedRequestsFor, pct, rawDisplayLabel, setInsightCard, setWidth, stamp, state, statusOf, statusText } from './state.js';

export function syncSecretToggleState() {
  const button = el('toggleSecretDisplay');
  if (!button) return;
  const showingPlain = state.secretDisplay === 'plain';
  button.textContent = showingPlain ? '隐藏原文' : '显示原文';
  button.setAttribute('aria-pressed', String(showingPlain));
  button.classList.toggle('is-plain', showingPlain);
}

function updateMetricMeters(totals) {
  const avgLatency = totals.latencyCount ? Math.round(totals.latency / totals.latencyCount) : 0;
  setWidth('usageMeter', totals.requests > 0 ? Math.min(100, Math.max(8, Math.log10(totals.requests + 1) * 24)) : 0);
  setWidth('successMeter', totals.requests > 0 ? totals.success / totals.requests * 100 : 0);
  setWidth('rateLimitMeter', totals.requests > 0 ? totals.rateLimits / totals.requests * 100 : 0);
  setWidth('latencyMeter', avgLatency > 0 ? Math.min(100, avgLatency / 3000 * 100) : 0);
  setWidth('failureMeter', totals.requests > 0 ? totals.failures / totals.requests * 100 : 0);
}

function setProxyFlowNode(id, tone, value, hint, actionId) {
  const node = el(id);
  const valueEl = el(id + 'Value');
  const hintEl = el(id + 'Hint');
  if (!node) return;
  node.className = 'proxy-flow-node overview-signal ' + tone;
  if (valueEl) valueEl.textContent = value;
  if (hintEl) hintEl.textContent = hint;
  if (actionId) node.dataset.overviewSignalAction = actionId;
}

function statusTone(status) {
  const code = Number(status);
  if (!Number.isFinite(code)) return 'blue';
  if (code >= 500) return 'bad';
  if (code >= 400) return 'warn';
  return 'good';
}

function flowPath(log) {
  if (!log) return '-';
  const method = log.method ? String(log.method).toUpperCase() + ' ' : '';
  return method + (log.path || '-');
}

function renderProxyFlowMap(totals, latestLog, latestErrorLog, severity) {
  const config = state.config || {};
  const upstream = config.upstream || 'Exa API';
  const tokenTone = latestLog?.tokenId ? 'good' : state.keys.length ? 'blue' : 'warn';
  const tokenValue = latestLog?.tokenId ? latestLog.tokenId : '等待请求';
  const tokenHint = latestLog?.tokenId ? '最近客户端令牌已通过代理认证' : '用客户端令牌发起请求后形成链路样本';
  const proxyTone = latestLog ? statusTone(latestLog.status) : severity;
  const proxyValue = latestLog ? flowPath(latestLog) : (state.keys.length ? '待观测' : '未配置密钥');
  const proxyHint = latestLog ? '状态 ' + (latestLog.status || '-') + ' · ' + ms(latestLog.latencyMs) : '最近请求会显示路径、状态和延迟';
  const keyTone = totals.healthy === 0 ? (state.keys.length ? 'bad' : 'warn') : totals.cooldown || totals.disabled ? 'warn' : 'good';
  const keyValue = fmt(totals.healthy) + ' / ' + fmt(state.keys.length) + ' 健康';
  const keyHint = state.keys.length ? '冷却 ' + fmt(totals.cooldown) + ' · 禁用 ' + fmt(totals.disabled) : '导入 Exa Key 后开始调度';
  const upstreamTone = latestErrorLog ? statusTone(latestErrorLog.status) : latestLog ? statusTone(latestLog.status) : 'blue';
  const upstreamValue = latestLog ? 'HTTP ' + (latestLog.status || '-') : '等待响应';
  const upstreamHint = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) + ' · ' + (latestErrorLog.path || '-') : latestLog ? (latestLog.errorCode ? labelOf(latestLog.errorCode) : '上游响应来自 ' + upstream) : '成功或失败会回写请求日志';
  const summary = !state.keys.length ? '链路尚未闭环：先导入 Exa Key，再用客户端令牌发起一次代理请求。' : latestLog ? '最近链路：' + flowPath(latestLog) + ' 经 ' + (Array.isArray(latestLog.keyIds) && latestLog.keyIds.length ? latestLog.keyIds.map(displayLabelById).join(' -> ') : '密钥池') + ' 返回 ' + (latestLog.status || '-') + '。' : '代理已具备密钥池上下文，等待第一条客户端请求形成完整链路。';

  el('proxyFlowSummary').textContent = summary;
  setProxyFlowNode('proxyFlowToken', tokenTone, tokenValue, tokenHint, 'logs-focus');
  setProxyFlowNode('proxyFlowProxy', proxyTone, proxyValue, proxyHint, latestErrorLog ? 'log-errors' : 'logs-focus');
  setProxyFlowNode('proxyFlowKey', keyTone, keyValue, keyHint, keyTone === 'good' ? 'keys' : 'keys-problem');
  setProxyFlowNode('proxyFlowUpstream', upstreamTone, upstreamValue, upstreamHint, latestErrorLog ? (Number(latestErrorLog.status) === 429 || latestErrorLog.errorCode === 'rate_limit' ? 'log-rate-limit' : 'log-errors') : 'logs-focus');
}

function activityAction(log) {
  const status = Number(log?.status);
  if (status === 429 || log?.errorCode === 'rate_limit') return 'log-rate-limit';
  if (log?.errorCode || (Number.isFinite(status) && status >= 400)) return 'log-errors';
  return 'logs-focus';
}

function activityKeyLabel(log) {
  const ids = Array.isArray(log?.keyIds) ? log.keyIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) return log?.tokenId ? '令牌 ' + log.tokenId : '未匹配密钥';
  const labels = ids.map(displayLabelById);
  return labels.length > 1 ? labels[0] + ' +' + (labels.length - 1) : labels[0];
}

function activityStatusText(log) {
  const status = Number(log?.status);
  if (Number.isFinite(status)) return String(status);
  return labelOf(log?.errorCode);
}

function renderActivityItem(log) {
  const method = String(log.method || 'REQ').toUpperCase();
  const path = String(log.path || '-');
  const statusTextValue = activityStatusText(log);
  const latency = ms(log.latencyMs);
  const keyLabel = activityKeyLabel(log);
  const timeLabel = stamp(log.createdAt);
  const reason = log.errorCode ? labelOf(log.errorCode) : (log.requestId ? String(log.requestId) : '请求完成');
  const tone = log.errorCode ? (Number(log.status) >= 500 ? 'bad' : 'warn') : statusTone(log.status);
  const action = activityAction(log);
  const ariaLabel = '查看最近请求日志：' + method + ' ' + path + '，状态 ' + statusTextValue + '，耗时 ' + latency;
  return '<button class="recent-activity-item overview-signal ' + esc(tone) + '" type="button" data-overview-signal-action="' + esc(action) + '" aria-label="' + esc(ariaLabel) + '">' +
    '<span class="recent-activity-head"><span class="recent-activity-method">' + esc(method) + '</span><strong class="mono recent-activity-path">' + esc(path) + '</strong></span>' +
    '<span class="recent-activity-meta"><span class="badge ' + esc(tone) + '">HTTP ' + esc(statusTextValue) + '</span><span>' + esc(latency) + '</span><span>' + esc(keyLabel) + '</span></span>' +
    '<small>' + esc(timeLabel) + ' · ' + esc(reason) + '</small>' +
  '</button>';
}

function renderRecentActivityRail(operationalLogs) {
  const title = el('recentActivityTitle');
  const meta = el('recentActivityMeta');
  const list = el('recentActivityList');
  if (!list) return;
  const recent = operationalLogs.slice(0, 4);
  if (!recent.length) {
    if (title) title.textContent = '暂无请求活动';
    if (meta) meta.textContent = state.keys.length ? '密钥池已就绪，等待客户端流量形成证据。' : '先导入 Exa Key，再发起代理请求。';
    list.innerHTML = '<div class="recent-activity-empty"><strong>暂无请求日志</strong><span>刷新后这里会列出最近 4 次代理请求。</span></div>';
    return;
  }
  const latest = recent[0];
  const failures = recent.filter((log) => log.errorCode || Number(log.status) >= 400).length;
  if (title) title.textContent = '最近 ' + fmt(recent.length) + ' 次请求';
  if (meta) meta.textContent = failures ? '最近样本包含 ' + fmt(failures) + ' 条异常，点击可直接筛选日志。' : '最近样本均正常，可继续观察链路延迟。';
  list.innerHTML = recent.map(renderActivityItem).join('');
  list.dataset.latestStatus = String(latest.status || '');
}

function updateOpsStrip(totals) {
  const totalKeys = Math.max(state.keys.length, 1);
  const healthyRatio = totals.healthy / totalKeys * 100;
  const cooldownRatio = totals.cooldown / totalKeys * 100;
  const disabledRatio = totals.disabled / totalKeys * 100;
  const operationalLogs = state.logs.filter(isOperationalLog);
  const latestLog = operationalLogs[0] || null;
  const latestErrorLog = operationalLogs.find((log) => log.errorCode || Number(log.status) >= 400);
  const severity = totals.healthy === 0 && state.keys.length ? 'bad' : totals.cooldown || totals.failures ? 'warn' : 'good';
  const severityText = severity === 'good' ? '稳定' : severity === 'warn' ? '需关注' : '故障';
  const alertText = severity === 'good' ? '暂无需要人工处理的告警。' : severity === 'warn' ? '告警摘要：存在冷却中密钥或上游错误，请关注重试与失败趋势。' : '告警摘要：当前没有健康密钥，请立即恢复密钥池。';
  el('healthyKeyCount').textContent = String(totals.healthy);
  el('cooldownKeyCount').textContent = String(totals.cooldown);
  el('disabledKeyCount').textContent = String(totals.disabled);
  el('healthyPct').textContent = Math.round(healthyRatio) + '%';
  el('cooldownPct').textContent = Math.round(cooldownRatio) + '%';
  el('disabledPct').textContent = Math.round(disabledRatio) + '%';
  setWidth('healthyBar', healthyRatio);
  setWidth('cooldownBar', cooldownRatio);
  setWidth('disabledBar', disabledRatio);
  el('opsSeverity').className = 'badge ' + severity;
  el('opsSeverity').textContent = severityText;
  el('opsAlert').className = 'ops-alert ' + severity;
  el('opsAlert').textContent = alertText;
  el('latestStatus').className = 'badge ' + (latestErrorLog ? (Number(latestErrorLog.status) >= 500 ? 'bad' : 'warn') : 'good');
  el('latestStatus').textContent = latestErrorLog ? labelOf(latestErrorLog.errorCode || 'upstream_error') : '无异常';
  el('latestError').textContent = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) : '-';
  el('latestPath').textContent = latestLog ? latestLog.path : '-';
  el('latestChain').textContent = latestLog && Array.isArray(latestLog.keyIds) ? latestLog.keyIds.map(displayLabelById).join(' -> ') : '-';
  renderProxyFlowMap(totals, latestLog, latestErrorLog, severity);
  renderRecentActivityRail(operationalLogs);
}

function updateOverviewInsights(totals) {
  const operationalLogs = state.logs.filter(isOperationalLog);
  const latestErrorLog = operationalLogs.find((log) => log.errorCode || Number(log.status) >= 400);
  const hasHealthyKey = state.keys.some((key) => statusOf(key) === 'Healthy');
  const hasRequests = totals.requests > 0 || operationalLogs.length > 0;
  const errorRate = totals.requests > 0 ? totals.failures / totals.requests : 0;
  const rateLimitRate = totals.requests > 0 ? totals.rateLimits / totals.requests : 0;

  if (!state.keys.length) {
    setInsightCard('insightJudgement', 'bad', '密钥池尚未配置', '导入至少一把 Exa Key 后，代理才会开始处理客户端请求。');
    setInsightCard('insightNextAction', 'warn', '批量导入密钥', '打开密钥池的批量导入，完成后再观察请求趋势。', { id: 'import-keys', label: '导入密钥' });
    return;
  }
  if (!hasHealthyKey) {
    setInsightCard('insightJudgement', 'bad', '没有健康密钥', '所有可用密钥都处于禁用或冷却状态，客户端请求会持续失败。');
    setInsightCard('insightNextAction', 'bad', '恢复密钥池', '优先启用或测试密钥，并重置确认可恢复的冷却项。', { id: 'keys-problem', label: '查看异常密钥' });
    return;
  }
  if (!hasRequests) {
    setInsightCard('insightJudgement', 'warn', '代理已就绪，等待流量', '密钥池可用，但当前窗口还没有可分析的客户端请求。');
    setInsightCard('insightNextAction', 'blue', '发起一次探测请求', '用客户端令牌调用代理路径，验证认证、路由和上游响应。', { id: 'logs-focus', label: '查看请求日志' });
    return;
  }
  if (latestErrorLog || errorRate >= 0.05 || rateLimitRate >= 0.05 || totals.cooldown > 0) {
    const reason = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) : totals.cooldown ? '密钥冷却' : rateLimitRate >= 0.05 ? '限流升高' : '失败升高';
    setInsightCard('insightJudgement', 'warn', '运行中，需要关注', '最近窗口出现 ' + reason + '，建议结合趋势和请求链路确认影响范围。');
    setInsightCard('insightNextAction', 'warn', '查看异常密钥与日志', '先筛选异常密钥，再打开请求日志的链路诊断定位失败路径。', { id: totals.cooldown > 0 ? 'keys-problem' : 'logs-focus', label: totals.cooldown > 0 ? '筛选异常密钥' : '定位请求日志' });
    return;
  }
  setInsightCard('insightJudgement', 'good', '运行稳定', '健康密钥可用，当前窗口内没有需要立即处理的异常信号。');
  setInsightCard('insightNextAction', 'blue', '继续观察趋势', '保持自动刷新，必要时切换 1 小时或 7 天窗口对比变化。', { id: 'trend-focus', label: '调整观测窗口' });
}

export function updateSummary() {
  const totals = computeTotals(state.keys);
  const errorRate = pct(totals.failures, totals.requests);
  const hasHealthyKey = state.keys.some((key) => statusOf(key) === 'Healthy');
  const serviceClass = hasHealthyKey ? '' : totals.active ? 'warn' : 'bad';
  el('serviceDot').className = 'status-dot ' + serviceClass;
  el('serviceStatus').textContent = hasHealthyKey ? '运行中' : totals.active ? '降级' : '无可用';
  el('activeKeys').textContent = String(totals.active);
  el('totalRequests').textContent = fmt(totals.requests);
  el('errorRate').textContent = errorRate;
  el('errorRate').className = 'summary-value ' + (totals.failures ? 'bad' : 'good');
  el('usageMetric').textContent = fmt(totals.requests);
  el('successMetric').textContent = pct(totals.success, totals.requests);
  el('rateLimitMetric').textContent = fmt(totals.rateLimits);
  el('latencyMetric').textContent = ms(totals.latencyCount ? Math.round(totals.latency / totals.latencyCount) : 0);
  el('failureMetric').textContent = fmt(totals.failures);
  el('keyCount').textContent = fmt(state.keys.length) + ' 个密钥';
  updateMetricMeters(totals);
  updateOpsStrip(totals);
  updateOverviewInsights(totals);
}

function keyScopeText(filter, query) {
  const filterLabels = { All: '全部密钥', Healthy: '健康密钥', Cooldown: '冷却密钥', Disabled: '禁用密钥', Problem: '异常密钥' };
  const base = filterLabels[filter] || '全部密钥';
  if (!query && filter === 'All') return base;
  if (!query) return base;
  const searchText = '搜索 "' + query + '"';
  return filter === 'All' ? searchText : base + ' + ' + searchText;
}

function keyFilterLabel(filter) {
  return { All: '全部', Healthy: '健康', Cooldown: '冷却', Disabled: '禁用', Problem: '异常' }[filter] || '全部';
}

function keyFilterState(filter, query) {
  const filters = [];
  if (query) filters.push({ label: '关键词', value: query });
  if (filter && filter !== 'All') filters.push({ label: '状态', value: keyFilterLabel(filter) });
  return { filters, active: filters.length > 0 };
}

function renderKeyFilterSummary({ rows, filter, query }) {
  const summary = el('keyFilterSummary');
  if (!summary) return;
  const filterState = keyFilterState(filter, query);
  const chips = el('keyFilterSummaryChips');
  const text = el('keyFilterSummaryText');
  const clearButton = el('clearKeyFilters');
  summary.classList.toggle('is-empty', !filterState.active);
  if (text) {
    text.textContent = filterState.active
      ? '当前显示 ' + fmt(rows.length) + ' 个匹配密钥。批量操作会沿用当前页范围。'
      : '当前显示全部密钥，可按关键词或状态收窄。';
  }
  if (chips) {
    chips.innerHTML = filterState.active
      ? filterState.filters.map((item) => '<span class="key-filter-chip"><strong>' + esc(item.label) + '</strong>' + esc(item.value) + '</span>').join('')
      : '<span class="key-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filterState.active;
}

function keyScopeHint(filter, query, totalPages) {
  if (!query && filter === 'All') return '未筛选';
  const pageHint = fmt(totalPages) + ' 页结果';
  if (query && filter !== 'All') return '组合筛选，' + pageHint;
  if (query) return '关键词范围，' + pageHint;
  return '状态筛选，' + pageHint;
}

function keySortAriaLabel(label, isActive, direction) {
  if (!isActive) return '按' + label + '排序';
  const current = direction === 'desc' ? '降序' : '升序';
  const next = direction === 'desc' ? '升序' : '降序';
  return '按' + label + '排序，当前' + current + '，再次点击切换为' + next;
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

function sortKeyRows(rows) {
  if (!state.keySort.column) return rows;
  const col = state.keySort.column;
  const dir = state.keySort.direction === 'desc' ? -1 : 1;
  const sortMap = { requests: 'totalRequests', success: 'successCount', failures: 'failureCount', rateLimits: 'rateLimitCount', timeouts: 'timeoutCount' };
  const field = sortMap[col] || col;
  rows.sort((a, b) => (Number(a[field] || 0) - Number(b[field] || 0)) * dir);
  return rows;
}

export function updateKeyWorkflowSelection() {
  const selectedCount = state.selectedKeyIds.length;
  const selectedItem = document.querySelector('[data-workflow-item="selected"]');
  if (selectedItem) {
    selectedItem.className = 'key-workflow-item ' + (selectedCount ? 'is-blue' : '');
    selectedItem.disabled = selectedCount === 0;
    const label = selectedCount ? '聚焦 ' + fmt(selectedCount) + ' 个已选密钥的批量操作栏' : '选择密钥后聚焦批量操作栏';
    selectedItem.setAttribute('aria-label', label);
    selectedItem.title = label;
  }
  const selected = el('keyWorkflowSelected');
  const hint = el('keyWorkflowSelectedHint');
  if (selected) selected.textContent = fmt(selectedCount);
  if (hint) hint.textContent = selectedCount ? '批量栏已启用' : '勾选密钥后启用';
}

function syncKeyWorkflowAction(action, disabled, label) {
  const button = document.querySelector('[data-key-workflow-action="' + action + '"]');
  if (!button) return;
  button.disabled = disabled;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function renderKeyWorkflowSummary({ rows, pageRows, problemCount, filter, query, totalPages, start }) {
  const visible = el('keyWorkflowVisible');
  if (!visible) return;
  const visibleHint = el('keyWorkflowVisibleHint');
  const problems = el('keyWorkflowProblems');
  const problemHint = el('keyWorkflowProblemHint');
  const scope = el('keyWorkflowScope');
  const scopeHint = el('keyWorkflowScopeHint');
  const visibleItem = document.querySelector('[data-workflow-item="visible"]');
  const problemItem = document.querySelector('[data-workflow-item="problems"]');
  const scopeItem = document.querySelector('[data-workflow-item="scope"]');
  const pageStart = rows.length ? start + 1 : 0;
  const pageEnd = start + pageRows.length;
  const scopeText = keyScopeText(filter, query);

  visible.textContent = fmt(rows.length);
  if (visibleHint) visibleHint.textContent = pageRows.length ? '当前页 ' + fmt(pageStart) + '-' + fmt(pageEnd) : '当前页 0 个';
  if (problems) problems.textContent = fmt(problemCount);
  if (problemHint) problemHint.textContent = problemCount ? (filter === 'Problem' ? '异常筛选结果' : '冷却 / 禁用 / 错误') : '当前范围稳定';
  if (scope) {
    scope.textContent = scopeText;
    scope.title = scopeText;
  }
  if (scopeHint) scopeHint.textContent = keyScopeHint(filter, query, totalPages);
  if (visibleItem) visibleItem.className = 'key-workflow-item ' + (rows.length ? 'is-good' : '');
  if (problemItem) problemItem.className = 'key-workflow-item ' + (problemCount ? 'is-warn' : 'is-good');
  if (scopeItem) scopeItem.className = 'key-workflow-item ' + ((query || filter !== 'All') ? 'is-blue' : '');
  const resetLabel = query || filter !== 'All' ? '清除密钥筛选，恢复全部密钥' : '聚焦全部密钥筛选入口';
  syncKeyWorkflowAction('reset', false, resetLabel);
  syncKeyWorkflowAction('problems', problemCount === 0, problemCount ? '筛选 ' + fmt(problemCount) + ' 个异常密钥' : '当前范围没有异常密钥');
  syncKeyWorkflowAction('scope', false, query || filter !== 'All' ? '聚焦密钥搜索，调整当前筛选范围' : '聚焦密钥搜索，收窄密钥范围');
  updateKeyWorkflowSelection();
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

  // Update chip counts and active state
  const chipCounts = { All: state.keys.length, Healthy: healthyCount, Cooldown: cooldownCount, Disabled: disabledCount, Problem: problemCount };
  document.querySelectorAll('#keyFilterChips .chip').forEach((chip) => {
    const value = chip.dataset.chip;
    chip.classList.toggle('active', value === filter);
    const countSpan = chip.querySelector('.chip-count');
    if (countSpan) countSpan.textContent = String(chipCounts[value] || 0);
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
  el('keyPager').textContent = '显示 ' + fmt(rows.length ? start + 1 : 0) + '-' + fmt(start + pageRows.length) + ' / ' + fmt(rows.length) + ' 个密钥';
  el('keyPageLabel').textContent = '第 ' + fmt(state.keyPage) + ' / ' + fmt(totalPages) + ' 页';
  el('prevKeyPage').disabled = state.keyPage <= 1;
  el('nextKeyPage').disabled = state.keyPage >= totalPages;
  if (!rows.length) {
    state.mobileDetailsOpen = false;
    el('keysBody').innerHTML = state.keys.length === 0
      ? '<tr><td colspan="10" class="empty empty-onboarding"><div class="first-run-empty"><div class="empty-kicker">首次配置</div><h3>还没有可调度的 Exa Key</h3><p>导入至少一把上游 Key 后，代理才会开始处理客户端请求。密钥会写入本地状态库，并按当前加密策略保存。</p><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="import">批量导入密钥</button><span>支持每行一个 Key 或 <code>id:key:weight</code></span></div></div></td></tr>'
      : '<tr><td colspan="10" class="empty">没有匹配的密钥。请调整搜索、状态筛选或清空过滤条件。</td></tr>';
    setDetailBodies(state.keys.length === 0 ? '<div class="empty">导入密钥后，这里会显示选中密钥的用量、冷却和最后错误。</div>' : '<div class="empty">当前筛选没有匹配的密钥。清空搜索或状态筛选后再查看详情。</div>');
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
    return '<tr data-key-id="' + esc(key.id) + '"' + selected + '>' +
      '<td class="col-check"><input type="checkbox" class="key-checkbox" data-key-check="' + esc(key.id) + '" aria-label="选择密钥 ' + esc(keyLabel) + '"' + checked + '></td>' +
      '<td class="mono">' + esc(keyLabel) + '</td>' +
      '<td><button class="toggle ' + (key.enabled ? 'on' : '') + '" data-action="toggle" aria-label="切换密钥 ' + esc(keyLabel) + ' 启用状态" aria-pressed="' + (key.enabled ? 'true' : 'false') + '"></button></td>' +
      '<td>' + fmt(observedRequests) + '</td>' +
      '<td class="good">' + success + '</td>' +
      '<td class="bad">' + fmt(key.failureCount) + '</td>' +
      '<td class="warn">' + fmt(key.rateLimitCount) + '</td>' +
      '<td>' + fmt(key.timeoutCount) + '</td>' +
      '<td><span class="badge ' + classForStatus(status) + '">' + (status === 'Cooldown' ? cooldownLeft(key.cooldownUntil) : statusText[status]) + '</span></td>' +
      '<td class="action-cell"><button class="mini-btn" data-action="select" title="查看详情" aria-label="查看密钥 ' + esc(keyLabel) + ' 详情">详情</button><button class="mini-btn" data-action="reset" title="重置熔断" aria-label="重置密钥 ' + esc(keyLabel) + ' 冷却">重置</button><button class="mini-btn primary-mini" data-action="test" title="测试密钥" aria-label="测试密钥 ' + esc(keyLabel) + '">测试</button></td>' +
    '</tr>';
  }).join('');
  renderDetails();
}

export function showKeyOnCurrentPage(id) {
  if (!id || !state.keys.some((key) => key.id === id)) return false;
  const rows = sortKeyRows(state.keys.slice());
  const index = rows.findIndex((key) => key.id === id);
  if (index < 0) return false;
  state.keyPage = Math.floor(index / state.keyPageSize) + 1;
  return true;
}

function pickDefaultKey() {
  if (state.selectedId && state.keys.some((item) => item.id === state.selectedId)) return state.selectedId;
  const cooling = state.keys.find((item) => statusOf(item) === 'Cooldown');
  return (cooling || state.keys[0])?.id || null;
}

function detailHealthFor(key, status, observedRequests) {
  const failures = Number(key.failureCount || 0);
  const rateLimits = Number(key.rateLimitCount || 0);
  const timeouts = Number(key.timeoutCount || 0);
  if (status === 'Disabled') {
    return { tone: 'bad', title: '已暂停调度', text: '该密钥不会接收新请求。启用前建议先测试上游连通性。' };
  }
  if (status === 'Cooldown') {
    return { tone: 'warn', title: '冷却保护中', text: '调度器正在避开该密钥。优先查看冷却原因与最近失败。' };
  }
  if (failures || rateLimits || timeouts) {
    return { tone: 'warn', title: '存在异常信号', text: '近 24 小时出现失败、429 或超时。建议测试后再放大流量。' };
  }
  if (!observedRequests) {
    return { tone: 'blue', title: '等待请求样本', text: '当前可参与调度，但还没有足够请求样本判断稳定性。' };
  }
  return { tone: 'good', title: '可继续调度', text: '当前窗口没有记录失败信号，可保持自动刷新观察趋势。' };
}

function operationFor(key) {
  if (state.lastOperation && state.lastOperation.id === key.id) return state.lastOperation;
  return { id: key.id, tone: 'warn', title: '等待操作', message: '测试、重置、启用或禁用后，这里会记录本次操作的状态、延迟和结果。', time: '-' };
}

function renderFailureSummary(key) {
  const summary = state.keyFailures[key.id];
  if (!summary) return '<div class="failure-reasons"><div class="reason-row"><span>摘要</span><strong>等待载入</strong></div></div>';
  const reasons = Object.entries(summary.reasons || {});
  if (!reasons.length) return '<div class="failure-reasons"><div class="reason-row"><span>摘要</span><strong>暂无最近失败</strong></div></div>';
  return '<div class="failure-reasons">' + reasons.map(([reason, count]) => '<div class="reason-row"><span>' + esc(labelOf(reason)) + '</span><strong>' + fmt(count) + ' 次</strong></div>').join('') +
    '<div class="reason-row"><span>最近状态</span><strong>' + esc(summary.lastStatus || '-') + '</strong></div>' +
    '<div class="reason-row"><span>最近时间</span><strong>' + esc(stamp(summary.lastFailureAt)) + '</strong></div></div>';
}

function setDetailBodies(markup) {
  document.querySelectorAll('.detail-body-target').forEach((body) => { body.innerHTML = markup; });
}

function syncMobileDetailsPanel() {
  const panel = el('mobileDetails');
  if (!panel) return;
  panel.classList.toggle('is-open', Boolean(state.mobileDetailsOpen));
}

function syncDetailFocusIntent() {
  if (!state.detailFocusAction || Date.now() > Number(state.detailFocusUntil || 0)) return;
  requestAnimationFrame(() => {
    if (!state.detailFocusAction || Date.now() > Number(state.detailFocusUntil || 0)) return;
    const root = window.getComputedStyle(el('mobileDetails')).display === 'none' ? el('detailsBody') : el('mobileDetailsBody');
    const target = root?.querySelector('button[data-detail-action="' + state.detailFocusAction + '"]');
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  });
}

function renderDetailMarkup(key) {
  const status = statusOf(key);
  const observedRequests = observedRequestsFor(key);
  const successRate = pct(key.successCount, observedRequests);
  const failureRate = pct(key.failureCount, observedRequests);
  const rateLimitRate = pct(key.rateLimitCount, observedRequests);
  const timeoutRate = pct(key.timeoutCount, observedRequests);
  const toggleAction = key.enabled ? 'disable' : 'enable';
  const toggleLabel = key.enabled ? '禁用密钥' : '启用密钥';
  const toggleClass = key.enabled ? 'danger-btn' : 'primary-btn';
  const cooldownState = status === 'Cooldown' ? '进行中' : '未冷却';
  const keyLabel = displayLabel(key);
  const health = detailHealthFor(key, status, observedRequests);
  const schedulingText = key.enabled ? '参与调度' : '不参与调度';
  const incidentText = key.lastError ? '告警摘要：最近一次失败为 ' + labelOf(key.lastError) + '，状态码 ' + (key.lastStatus || '-') + '。' : '告警摘要：未记录最近失败。';
  const operation = operationFor(key);
  return '<section class="detail-section detail-hero"><div class="key-title"><div class="key-name"><span class="detail-kicker">当前密钥</span><strong class="mono">' + esc(keyLabel) + '</strong></div><span class="badge ' + classForStatus(status) + '">' + esc(statusText[status]) + '</span></div>' +
    '<div class="detail-health ' + esc(health.tone) + '"><strong>' + esc(health.title) + '</strong><span>' + esc(health.text) + '</span></div>' +
    '<div class="detail-facts"><span><small>调度</small><strong>' + schedulingText + '</strong></span><span><small>权重</small><strong>' + fmt(key.weight) + '</strong></span><span><small>密钥 ID</small><strong class="mono">' + esc(keyLabel) + '</strong></span></div></section>' +
    '<section class="detail-section detail-usage"><div class="detail-section-head"><h3>近 24 小时</h3><span>请求样本与异常比例</span></div><div class="detail-kpis"><div class="detail-kpi"><span>请求</span><strong>' + fmt(observedRequests) + '</strong></div><div class="detail-kpi"><span>成功率</span><strong class="good">' + successRate + '</strong></div><div class="detail-kpi"><span>失败率</span><strong class="bad">' + failureRate + '</strong></div><div class="detail-kpi"><span>429</span><strong class="warn">' + rateLimitRate + '</strong></div><div class="detail-kpi"><span>超时</span><strong>' + timeoutRate + '</strong></div><div class="detail-kpi"><span>延迟</span><strong>' + ms(key.lastLatencyMs) + '</strong></div></div></section>' +
    '<section class="detail-section detail-diagnostics"><div class="diagnostic-card cooldown-card"><h3>冷却处理</h3><div class="detail-row"><span>状态</span><span>' + cooldownState + '</span></div><div class="detail-row"><span>原因</span><span>' + esc(labelOf(key.cooldownReason)) + '</span></div><div class="detail-row"><span>剩余</span><span class="' + classForStatus(status) + '">' + cooldownLeft(key.cooldownUntil) + '</span></div></div>' +
    '<div class="diagnostic-card incident-timeline"><h3>最近失败原因</h3>' + renderFailureSummary(key) + '<div class="ops-alert ' + (key.lastError ? 'bad' : 'good') + '">' + esc(incidentText) + '</div><div class="timeline-item"><span>错误码</span><strong class="' + (key.lastError ? 'bad' : '') + '">' + esc(labelOf(key.lastError)) + '</strong></div><div class="timeline-item"><span>状态码</span><strong>' + esc(key.lastStatus || '-') + '</strong></div><div class="timeline-item"><span>时间</span><strong>' + esc(stamp(key.lastFailureAt)) + '</strong></div></div></section>' +
    '<section class="detail-section operation-feedback ' + esc(operation.tone) + '"><div class="feedback-title"><div><span class="feedback-kicker">操作反馈</span><h3>' + esc(operation.title) + '</h3></div><span>' + esc(operation.time) + '</span></div><div class="feedback-message">' + esc(operation.message) + '</div></section>' +
    '<section class="detail-section actions detail-actions"><button class="primary-btn" data-detail-action="test">测试密钥</button><button class="ghost-btn" data-detail-action="logs">查看日志</button><button class="ghost-btn" data-detail-action="copy">复制密钥</button><button class="ghost-btn" data-detail-action="reset">重置冷却</button><button class="' + toggleClass + '" data-detail-action="' + toggleAction + '">' + toggleLabel + '</button></section>';
}

export function renderDetails() {
  if (state.keys.length && state.pageKeyIds.length === 0) {
    setDetailBodies('<div class="empty">当前筛选没有匹配的密钥。清空搜索或状态筛选后再查看详情。</div>');
    syncMobileDetailsPanel();
    return;
  }
  state.selectedId = pickDefaultKey();
  const key = state.keys.find((item) => item.id === state.selectedId);
  if (!key) {
    setDetailBodies('<div class="empty">导入密钥后，这里会显示选中密钥的用量、冷却和最后错误。</div>');
    syncMobileDetailsPanel();
    return;
  }
  setDetailBodies(renderDetailMarkup(key));
  syncMobileDetailsPanel();
  syncDetailFocusIntent();
}
