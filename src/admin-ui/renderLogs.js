import { displayLabelById, el, esc, fmt, httpStatusClass, labelOf, ms, pct, stamp, state } from './state.js';

// Console audit list loads a recent non-paginated window (see admin.js ?limit=).
const AUDIT_LIST_WINDOW = 12;

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function logStatusLabel(value) {
  return { success: '成功', error: '异常', '4xx': '4xx', '5xx': '5xx', 429: '429' }[value] || value;
}

function numericStatus(log) {
  const status = Number(log?.status);
  return Number.isFinite(status) ? status : 0;
}

function latencyMs(log) {
  const value = Number(log?.latencyMs || 0);
  return Number.isFinite(value) ? value : 0;
}

function keyChainText(log) {
  return Array.isArray(log?.keyIds) ? log.keyIds.map(displayLabelById).join(' → ') : '-';
}

function knownKey(id) {
  return state.keys.some((key) => key.id === id);
}

function keyChainMarkup(log) {
  const ids = Array.isArray(log?.keyIds) ? log.keyIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) return '-';
  return '<span class="log-key-chain">' + ids.map((id, index) => {
    const label = displayLabelById(id);
    const separator = index > 0 ? '<span class="log-key-separator" aria-hidden="true">→</span>' : '';
    if (!knownKey(id)) return separator + '<span class="log-key-missing mono">' + esc(label) + '</span>';
    return separator + '<button class="log-key-link" type="button" data-log-key-action="open-detail" data-key-id="' + esc(id) + '" title="打开密钥 ' + esc(label) + ' 详情，可在侧栏复核用量与操作" aria-label="打开密钥 ' + esc(label) + ' 详情。可在侧栏复核用量与操作">' + esc(label) + '</button>';
  }).join('') + '</span>';
}

function requestIdLabel(value) {
  const text = String(value || '-');
  if (text.length <= 12) return text;
  const compact = text.startsWith('req_') ? text.slice(4) : text;
  if (compact.length <= 12) return compact;
  return compact.slice(0, 3) + '...' + compact.slice(-4);
}

function summarizeLogRows(rows) {
  return rows.reduce((summary, log) => {
    const status = numericStatus(log);
    const latency = latencyMs(log);
    if (status >= 400 || log.errorCode) summary.errors += 1;
    if (status === 429 || log.errorCode === 'rate_limit') summary.rateLimits += 1;
    if (!summary.slowest || latency > latencyMs(summary.slowest)) summary.slowest = log;
    return summary;
  }, { errors: 0, rateLimits: 0, slowest: null });
}

function renderLogDiagnostics(rows, filters) {
  const summary = summarizeLogRows(rows);
  const slowest = summary.slowest;
  const slowestPath = slowest?.path ? String(slowest.path) : '';
  const visibleCountText = fmt(rows.length);
  const visibleHintText = filters.active ? '匹配筛选' : rows.length ? '最近载入' : '暂无样本';
  const errorCountText = fmt(summary.errors);
  const errorRateText = pct(summary.errors, rows.length);
  const rateLimitCountText = fmt(summary.rateLimits);
  const rateLimitRateText = pct(summary.rateLimits, rows.length);
  const slowestLatencyText = slowest ? ms(latencyMs(slowest)) : '0 毫秒';
  const slowestPathText = slowest ? truncate(String(slowest.path || '-'), 28) : '待样本';
  el('logVisibleCount').textContent = visibleCountText;
  el('logVisibleHint').textContent = visibleHintText;
  el('logErrorCount').className = summary.errors ? 'bad' : 'good';
  el('logErrorCount').textContent = errorCountText;
  el('logErrorRate').textContent = errorRateText;
  el('logRateLimitCount').className = summary.rateLimits ? 'warn' : 'good';
  el('logRateLimitCount').textContent = rateLimitCountText;
  el('logRateLimitRate').textContent = rateLimitRateText;
  el('logSlowestLatency').textContent = slowestLatencyText;
  el('logSlowestPath').textContent = slowestPathText;
  const resetAction = filters.active ? '清除日志筛选，恢复最近请求日志' : '刷新最近请求日志';
  const errorAction = summary.errors ? '筛选异常请求日志并查看链路' : '当前可见日志没有异常请求';
  const rateLimitAction = summary.rateLimits ? '筛选 429 请求日志并收窄路径' : '当前可见日志没有 429 请求';
  const slowestActionLabel = slowestPath ? '按该路径筛选日志并查看链路' : '暂无最慢请求样本，可等待新请求后再试';
  syncLogDiagnosticAction('reset', false, '显示日志：' + visibleCountText + '，' + visibleHintText + '。' + resetAction);
  syncLogDiagnosticAction('errors', summary.errors === 0, '异常请求：' + errorCountText + '，' + errorRateText + '。' + errorAction);
  syncLogDiagnosticAction('rate-limit', summary.rateLimits === 0, '429 请求：' + rateLimitCountText + '，' + rateLimitRateText + '。' + rateLimitAction);
  syncLogDiagnosticAction('slowest', !slowestPath, '最慢请求：' + slowestLatencyText + '，' + slowestPathText + '。' + slowestActionLabel);
  const slowestAction = document.querySelector('[data-log-diagnostic-action="slowest"]');
  if (slowestAction) slowestAction.dataset.logDiagnosticValue = slowestPath;
}

function syncLogDiagnosticAction(action, disabled, label) {
  const button = document.querySelector('[data-log-diagnostic-action="' + action + '"]');
  if (!button) return;
  button.disabled = disabled;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function logFilterState() {
  const query = el('logSearch')?.value?.trim() || '';
  const path = el('logPathFilter')?.value?.trim() || '';
  const key = el('logKeyFilter')?.value?.trim() || '';
  const status = el('logStatusFilter')?.value || '';
  const filters = [];
  if (query) filters.push({ key: 'query', label: '关键词', value: query });
  if (path) filters.push({ key: 'path', label: '路径', value: path });
  if (key) filters.push({ key: 'key', label: '密钥', value: key });
  if (status) filters.push({ key: 'status', label: '状态', value: logStatusLabel(status) });
  return { query, path, key, status, filters, active: filters.length > 0 };
}

function filterChipMarkup(kind, item) {
  return '<button type="button" class="' + kind + '-filter-chip is-removable" data-filter-remove="' + esc(item.key) + '" aria-label="移除' + esc(item.label) + '筛选：' + esc(item.value) + '。移除后刷新匹配结果"><strong>' + esc(item.label) + '</strong><span class="filter-chip-value">' + esc(item.value) + '</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>';
}

function renderLogFilterSummary(filters, visibleCount) {
  const summary = el('logFilterSummary');
  if (!summary) return;
  const chips = el('logFilterChips');
  const text = el('logFilterSummaryText');
  const clearButton = el('clearLogFilters');
  const summaryText = filters.active
    ? '匹配 ' + fmt(visibleCount) + ' 条 · 导出沿用路径/密钥/状态'
    : '最近请求日志 · 可按关键词/路径/密钥/状态收窄';
  const summaryNext = filters.active
    ? (visibleCount ? '可点 requestId 查看链路或清除筛选' : '可清除筛选或调整条件')
    : '可搜索 requestId 或按路径/状态筛选';
  summary.classList.toggle('is-empty', !filters.active);
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  summary.setAttribute('aria-label', '请求日志筛选状态：' + summaryText + '。' + summaryNext);
  if (text) text.textContent = summaryText;
  if (chips) {
    chips.innerHTML = filters.active
      ? filters.filters.map((filter) => filterChipMarkup('log', filter)).join('')
      : '<span class="log-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filters.active;
}

function renderLogEmptyState(kind) {
  const isFiltered = kind === 'filtered';
  const title = isFiltered ? '没有匹配的请求日志' : '暂无请求日志';
  const message = isFiltered
    ? '当前筛选条件没有命中记录。可清除筛选恢复最近日志，或调整关键词、路径、密钥、状态后继续排查。'
    : '代理收到客户端请求后，会在这里记录状态、延迟、尝试次数和密钥链路。可先刷新载入最近窗口，或从客户端发起一次探测请求。';
  const chips = isFiltered
    ? ['清除筛选', '调整条件', '刷新日志']
    : ['刷新日志', '发起请求', '可导出 CSV'];
  const actions = isFiltered
    ? '<div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="clear-log-filters" aria-label="清除请求日志筛选，恢复最近日志">清除筛选</button><span>恢复最近请求日志</span></div>'
    : '<div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="refresh-logs" aria-label="刷新请求日志，重新载入最近窗口">刷新日志</button><span>重新载入最近请求窗口</span></div>';
  return '<div class="log-empty-state ' + esc(kind) + '"><div class="empty-kicker" aria-hidden="true">请求日志</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' + actions + '</div>';
}

function renderTraceShortcuts() {
  const seen = new Set();
  const logs = (state.logs || []).filter((log) => {
    const id = String(log.requestId || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 3);
  if (!logs.length) return '';
  return '<div class="trace-shortcuts"><span>最近请求</span><div>' + logs.map((log) => {
    const id = String(log.requestId || '');
    const statusClass = httpStatusClass(log.status);
    const label = requestIdLabel(id);
    const traceTitle = '查看最近请求 ' + label + ' 链路，状态 ' + (log.status || '-') + '。可展开尝试顺序与密钥链';
    return '<button class="trace-shortcut" type="button" data-trace-id="' + esc(id) + '" title="' + esc(traceTitle) + '" aria-label="' + esc(traceTitle) + '"><span class="mono">' + esc(label) + '</span><span class="badge ' + statusClass + '" aria-hidden="true">' + esc(log.status) + '</span></button>';
  }).join('') + '</div></div>';
}

function summarizeTrace(rows) {
  const first = rows[0] || null;
  const last = rows[rows.length - 1] || null;
  const keyIds = [];
  let attempts = 0;
  for (const row of rows) {
    attempts += Math.max(0, Number(row?.attempts || 0));
    if (!Array.isArray(row.keyIds)) continue;
    for (const id of row.keyIds) if (!keyIds.includes(id)) keyIds.push(id);
  }
  const start = first ? Number(first.createdAt || 0) : 0;
  const end = last ? Number(last.createdAt || 0) : start;
  return {
    attempts: attempts || keyIds.length || rows.length,
    finalStatus: last ? String(last.status || '-') : '-',
    finalTone: httpStatusClass(last?.status),
    keyChain: keyIds.length ? keyIds.map(displayLabelById).join(' → ') : '-',
    duration: start && end && end >= start ? ms(end - start + latencyMs(last)) : ms(latencyMs(last)),
    path: last?.path || first?.path || '-'
  };
}

function renderTraceSummary(trace, rows) {
  const summary = summarizeTrace(rows);
  const finalNum = Number(summary.finalStatus);
  const summaryNext = Number.isFinite(finalNum) && finalNum >= 400
    ? '可点密钥链路打开详情，或回日志按状态筛选失败'
    : '可继续查看尝试顺序，或点密钥打开详情';
  const summaryAria = '请求链路 ' + (trace.requestId || '-') + '：尝试 ' + fmt(summary.attempts) + ' 次，最终状态 ' + summary.finalStatus + '，耗时 ' + summary.duration + '，路径 ' + summary.path + '。' + summaryNext;
  return '<div class="trace-summary" role="status" aria-live="polite" aria-atomic="true" aria-label="' + esc(summaryAria) + '"><div class="trace-summary-title"><span>请求链路</span><strong class="mono">' + esc(trace.requestId) + '</strong></div><div class="trace-summary-grid">' +
    '<span><small>尝试</small><strong>' + fmt(summary.attempts) + ' 次</strong></span>' +
    '<span><small>最终状态</small><strong class="' + summary.finalTone + '">' + esc(summary.finalStatus) + '</strong></span>' +
    '<span><small>链路耗时</small><strong>' + esc(summary.duration) + '</strong></span>' +
    '<span><small>路径</small><strong class="mono">' + esc(summary.path) + '</strong></span>' +
    '</div><div class="trace-chain"><span>密钥链路</span><strong class="mono">' + esc(summary.keyChain) + '</strong></div></div>';
}

function renderTraceEmptyState(kind, requestId = '') {
  const hasRequest = Boolean(requestId);
  const title = hasRequest ? '没有找到链路记录' : '选择请求 ID 查看链路';
  const message = hasRequest
    ? '该 requestId 没有返回关联记录。可检查日志保留窗口、确认 ID 是否完整，或清除筛选后重新点选请求。'
    : '点击请求日志中的 requestId，可展开该请求的尝试顺序、上游路径、状态码和密钥链路。也可先刷新日志或搜索 requestId。';
  const chips = hasRequest ? ['检查保留窗口', '确认 requestId', '清除筛选重试'] : ['点击 requestId', '刷新日志', '搜索 ID'];
  const actions = hasRequest
    ? '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="clear-log-filters" aria-label="清除请求日志筛选，恢复最近日志后重新点选">清除筛选</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="refresh-logs" aria-label="刷新请求日志，重新载入最近窗口">刷新日志</button>'
      + '<span>恢复最近请求后重新点选</span>'
      + '</div>'
    : '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="refresh-logs" aria-label="刷新请求日志，重新载入最近窗口">刷新日志</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="focus-log-search" aria-label="聚焦 requestId 搜索框，输入后收窄日志">搜索 requestId</button>'
      + '<span>或在表格中点击 requestId</span>'
      + '</div>';
  return '<div class="trace-empty-state ' + esc(kind) + '"><div class="empty-kicker" aria-hidden="true">链路诊断</div><div class="trace-empty-copy"><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p></div>' +
    (hasRequest ? '<div class="trace-empty-request"><span>requestId</span><strong class="mono">' + esc(requestId) + '</strong></div>' : '') +
    '<div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' +
    actions + renderTraceShortcuts() + '</div>';
}

const auditActionLabels = {
  admin_https_required: '管理访问要求 HTTPS',
  alert_webhook: '发送告警 Webhook',
  auto_prune_logs: '自动清理过期日志',
  batch_disable: '批量禁用密钥',
  batch_enable: '批量启用密钥',
  batch_reset: '批量重置冷却',
  batch_test: '批量测试密钥',
  batch_unknown: '批量操作',
  create_key: '创建密钥',
  delete_key: '删除密钥',
  disable_key: '禁用密钥',
  enable_key: '启用密钥',
  export_audit: '导出审计记录',
  export_logs: '导出请求日志',
  import_keys: '批量导入密钥',
  login: '管理员登录',
  logout: '管理员退出登录',
  prune_logs: '清理请求日志',
  reset_circuit: '重置密钥冷却',
  reveal_key_secret: '查看原始密钥',
  test_alert_webhook: '测试告警 Webhook',
  test_key: '测试密钥',
  update_key: '更新密钥'
};

function auditActionLabel(action) {
  const key = String(action || '').trim();
  if (!key) return '未知审计操作';
  if (auditActionLabels[key]) return auditActionLabels[key];
  if (key.startsWith('batch_')) return '批量操作';
  return key.replace(/_/g, ' ');
}

function auditOutcomeLabel(value) {
  return { success: '成功', failure: '失败' }[value] || value;
}

function auditFilterState() {
  const query = el('auditSearch')?.value?.trim() || '';
  const action = el('auditActionFilter')?.value || '';
  const outcome = el('auditOutcomeFilter')?.value || '';
  const filters = [];
  if (query) filters.push({ key: 'query', label: '关键词', value: query });
  if (action) filters.push({ key: 'action', label: '动作', value: auditActionLabel(action) });
  if (outcome) filters.push({ key: 'outcome', label: '结果', value: auditOutcomeLabel(outcome) });
  return { query, action, outcome, filters, active: filters.length > 0 };
}

function auditSearchText(item) {
  const rawAction = String(item?.action || '');
  return [
    auditActionLabel(rawAction),
    rawAction,
    item?.actorTokenId,
    item?.targetId,
    item?.detail,
    item?.ip,
    item?.userAgent,
    stamp(item?.createdAt)
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
}

function filterAuditRows(rows, filters) {
  const query = filters.query.toLowerCase();
  return rows.filter((item) => {
    if (filters.action && String(item?.action || '') !== filters.action) return false;
    if (filters.outcome === 'success' && !item?.success) return false;
    if (filters.outcome === 'failure' && item?.success) return false;
    if (query && !auditSearchText(item).includes(query)) return false;
    return true;
  });
}

function renderAuditFilterSummary(filters, visibleCount) {
  const summary = el('auditFilterSummary');
  if (!summary) return;
  const chips = el('auditFilterChips');
  const text = el('auditFilterSummaryText');
  const clearButton = el('clearAuditFilters');
  const summaryText = filters.active
    ? '匹配 ' + fmt(visibleCount) + ' 条 · 窗口最近 ' + fmt(AUDIT_LIST_WINDOW) + ' 条 · 导出沿用动作/结果'
    : '最近 ' + fmt(AUDIT_LIST_WINDOW) + ' 条审计 · 可按关键词/动作/结果收窄';
  const summaryNext = filters.active
    ? (visibleCount ? '可导出证据或清除筛选' : '可清除筛选或调整动作/结果')
    : '可搜索关键词或按动作/结果筛选';
  summary.classList.toggle('is-empty', !filters.active);
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  summary.setAttribute('aria-label', '审计筛选状态：' + summaryText + '。' + summaryNext);
  if (text) text.textContent = summaryText;
  if (chips) {
    chips.innerHTML = filters.active
      ? filters.filters.map((filter) => filterChipMarkup('audit', filter)).join('')
      : '<span class="audit-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filters.active;
}

function setAuditStatus(id, text, labelPrefix, nextAction = '') {
  const target = el(id);
  if (!target) return;
  const value = String(text ?? '');
  const next = String(nextAction || '').trim();
  target.textContent = value;
  target.setAttribute('role', 'status');
  target.setAttribute('aria-live', 'polite');
  target.setAttribute('aria-atomic', 'true');
  target.setAttribute('aria-label', labelPrefix + '：' + value + (next ? '。' + next : ''));
}

function renderAuditSummary(rows) {
  const total = rows.length;
  const success = rows.filter((item) => item.success).length;
  const failure = total - success;
  const latest = rows[0] || null;
  const latestAction = latest ? auditActionLabel(latest.action) : '暂无审计';
  const latestTime = latest ? stamp(latest.createdAt) : '刷新后显示最近管理员动作';
  const latestText = total ? latestAction + ' · ' + latestTime : latestAction;
  setAuditStatus('auditTotal', fmt(total), '审计总记录', total ? '可搜索动作/密钥 ID 或导出证据' : '可刷新审计或到密钥池生成证据');
  setAuditStatus('auditSuccess', fmt(success), '审计成功', success ? '可按结果筛选成功记录' : '完成管理操作后会出现成功记录');
  setAuditStatus('auditFailure', fmt(failure), '审计失败', failure ? '可筛选失败记录并复核' : '当前无失败审计');
  setAuditStatus('auditLatest', latestText, '最新审计', latest ? '可按最新线索搜索审计' : '可刷新列表等待新动作');
}

function renderAuditEvidence(rows, filters = { active: false }) {
  const total = rows.length;
  const failures = rows.filter((item) => !item.success).length;
  const latest = rows[0] || null;
  const latestAction = latest ? auditActionLabel(latest.action) : '暂无动作';
  const latestActor = latest?.actorTokenId || '-';
  const latestSearch = latest ? (latest.actorTokenId || latest.action || latestAction) : '';
  const exportReady = total > 0;
  const totalText = fmt(total);
  const failureText = fmt(failures);
  const failureRateText = pct(failures, total);
  const windowText = total
    ? (filters.active
      ? '窗口内匹配 ' + fmt(total) + ' 条'
      : '最近窗口 ' + fmt(total) + ' / 最多 ' + fmt(AUDIT_LIST_WINDOW) + ' 条')
    : (filters.active ? '当前筛选无命中' : '刷新后显示最近窗口');
  const actionText = latest ? latestAction + ' · ' + stamp(latest.createdAt) : latestAction;
  const exportText = exportReady ? '可导出' : '待生成';
  const exportHintText = exportReady ? (filters.action || filters.outcome ? '导出沿用动作与结果筛选' : '导出当前审计 CSV 证据') : '暂无可导出审计记录';
  const failureEl = el('auditEvidenceFailures');
  const exportEl = el('auditEvidenceExport');
  const resetAction = filters.active ? '清除审计筛选，恢复最近管理员审计' : (total ? '聚焦审计搜索，查看最近管理员审计' : '可刷新列表或到密钥池生成证据');
  const failureAction = failures ? '筛选失败审计记录并复核' : '当前证据范围没有失败审计';
  const latestActionHint = latestSearch ? '按最新线索搜索审计并收窄范围' : '暂无最新审计线索，完成管理操作后再试';
  const exportAction = exportReady ? '导出当前审计证据 CSV' : '暂无可导出审计记录';
  setAuditStatus('auditEvidenceTotal', totalText, '已载入证据', total ? resetAction : '可刷新列表或到密钥池生成证据');
  setAuditStatus('auditEvidenceWindow', windowText, '审计窗口', total ? resetAction : (filters.active ? '可清除筛选恢复最近审计' : '可刷新列表等待新动作'));
  if (failureEl) {
    failureEl.className = failures ? 'bad' : 'good';
  }
  setAuditStatus('auditEvidenceFailures', failureText, '失败审计', failures ? failureAction : '当前无失败审计');
  setAuditStatus('auditEvidenceFailureRate', failureRateText, '失败率', failures ? failureAction : '当前无失败审计');
  setAuditStatus('auditEvidenceActor', latestActor, '最新操作者', latestSearch ? latestActionHint : '完成管理操作后再试');
  setAuditStatus('auditEvidenceAction', actionText, '最新动作', latestSearch ? latestActionHint : '完成管理操作后再试');
  if (exportEl) {
    exportEl.className = exportReady ? 'good' : 'warn';
  }
  setAuditStatus('auditEvidenceExport', exportText, '导出状态', exportAction);
  setAuditStatus('auditEvidenceExportHint', exportHintText, '导出提示', exportAction);
  syncAuditEvidenceAction('reset', false, '已载入证据：' + totalText + '，' + windowText + '。' + resetAction);
  syncAuditEvidenceAction('failures', failures === 0, '失败审计：' + failureText + '，' + failureRateText + '。' + failureAction);
  syncAuditEvidenceAction('latest', !latestSearch, '最新线索：' + latestActor + '，' + actionText + '。' + latestActionHint);
  syncAuditEvidenceAction('export', !exportReady, '导出状态：' + exportText + '，' + exportHintText + '。' + exportAction);
  const latestActionEl = document.querySelector('[data-audit-evidence-action="latest"]');
  if (latestActionEl) latestActionEl.dataset.auditEvidenceValue = latestSearch;
}

function syncAuditEvidenceAction(action, disabled, label) {
  const button = document.querySelector('[data-audit-evidence-action="' + action + '"]');
  if (!button) return;
  button.disabled = disabled;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function renderAuditEmptyState(kind = 'empty') {
  const isFiltered = kind === 'filtered';
  const title = isFiltered ? '没有匹配的审计记录' : '暂无审计记录';
  const message = isFiltered
    ? '当前筛选条件没有命中记录。可清除关键词、动作或结果筛选，或刷新列表后恢复最近审计证据。'
    : '管理员登录、导出、密钥操作和日志治理动作会在这里形成可导出的证据链。可先刷新窗口，或到密钥池完成一次导入/测试后回来查看。';
  const chips = isFiltered ? ['清除筛选', '刷新列表', '调整条件'] : ['刷新审计', '密钥动作', '导出证据'];
  const actions = isFiltered
    ? '<div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="clear-audit-filters" aria-label="清除管理员审计筛选，恢复最近证据">清除筛选</button><button class="ghost-btn" type="button" data-empty-action="refresh-audit" aria-label="刷新审计列表，重新载入最近窗口">刷新列表</button><span>恢复最近管理员审计</span></div>'
    : '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="refresh-audit" aria-label="刷新审计列表，重新载入最近窗口">刷新列表</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="open-keys" aria-label="打开密钥池生成新的管理证据">打开密钥池</button>'
      + '<span>重新载入或生成新的管理证据</span>'
      + '</div>';
  return '<div class="audit-empty-state ' + esc(kind) + '"><div class="empty-kicker" aria-hidden="true">管理员审计</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' + actions + '</div>';
}

export function renderAudit() {
  const filters = auditFilterState();
  const sourceRows = state.audit || [];
  const rows = filterAuditRows(sourceRows, filters);
  renderAuditSummary(rows);
  renderAuditEvidence(rows, filters);
  renderAuditFilterSummary(filters, rows.length);
  const countEl = el('auditCount');
  if (countEl) {
    const auditCountText = filters.active
      ? '显示 ' + fmt(rows.length) + ' / 窗口 ' + fmt(sourceRows.length) + ' 条'
      : '最近窗口 ' + fmt(sourceRows.length) + ' 条';
    const auditCountNext = filters.active
      ? (rows.length ? '可复核条目或清除筛选' : '可清除筛选或刷新审计窗口')
      : (sourceRows.length ? '可搜索动作/密钥 ID 或导出证据' : '可刷新审计或到密钥池生成证据');
    countEl.textContent = auditCountText;
    countEl.setAttribute('role', 'status');
    countEl.setAttribute('aria-live', 'polite');
    countEl.setAttribute('aria-atomic', 'true');
    countEl.setAttribute('aria-label', '管理员审计：' + auditCountText + (filters.active ? '（筛选中）' : '') + '。' + auditCountNext);
  }
  const pager = el('auditPager');
  if (pager) {
    const auditPagerText = filters.active
      ? '当前显示 ' + fmt(rows.length) + ' 条 · 窗口已载入 ' + fmt(sourceRows.length) + ' 条'
      : '当前显示 ' + fmt(rows.length) + ' 条 · 最近窗口最多 ' + fmt(AUDIT_LIST_WINDOW) + ' 条';
    const auditPagerNext = filters.active
      ? '匹配来自最近窗口，非分页'
      : '最近载入窗口，非分页，可刷新扩展证据';
    pager.textContent = auditPagerText;
    pager.setAttribute('role', 'status');
    pager.setAttribute('aria-live', 'polite');
    pager.setAttribute('aria-atomic', 'true');
    pager.setAttribute('aria-label', '审计分页：' + auditPagerText + (filters.active ? '（筛选中）' : '') + '。' + auditPagerNext);
  }
  const pagerHint = el('auditPagerHint');
  if (pagerHint) {
    pagerHint.textContent = filters.active
      ? '匹配筛选 · 来自最近窗口 · 非分页'
      : '最近载入窗口 · 最多 ' + fmt(AUDIT_LIST_WINDOW) + ' 条 · 非分页';
  }
  el('auditList').innerHTML = rows.length ? rows.map((item) => {
    const rawAction = String(item.action || 'unknown_action');
    const label = auditActionLabel(rawAction);
    const tone = item.success ? 'good' : 'bad';
    const outcomeText = item.success ? '成功' : '失败';
    const outcomeNext = item.success
      ? '可继续复核其他证据，或导出当前审计 CSV'
      : '可对照详情排查失败原因，或筛选失败结果';
    const itemAria = '审计：' + label + '，结果 ' + outcomeText + '。目标 ' + (item.targetId || '-') + '。' + outcomeNext;
    return '<div class="audit-item ' + tone + '" role="article" aria-label="' + esc(itemAria) + '"><div class="audit-title"><span class="audit-action"><span>' + esc(label) + '</span><code class="audit-action-code">' + esc(rawAction) + '</code></span><span class="badge ' + tone + '" aria-label="审计结果：' + outcomeText + '。' + outcomeNext + '">' + outcomeText + '</span></div><div class="audit-meta-grid"><span><strong>时间</strong>' + esc(stamp(item.createdAt)) + '</span><span><strong>操作者</strong>' + esc(item.actorTokenId || '-') + '</span><span><strong>目标</strong>' + esc(item.targetId || '-') + '</span></div><div class="audit-detail">' + esc(item.detail || item.ip || '无附加详情') + '</div></div>';
  }).join('') : renderAuditEmptyState(filters.active || sourceRows.length ? 'filtered' : 'empty');
}

export function renderLogs() {
  const filters = logFilterState();
  const query = filters.query.toLowerCase();
  const rows = query ? state.logs.filter((log) => [log.method, log.path, log.query, log.tokenId, log.requestId, log.errorCode, log.status].some((v) => String(v ?? '').toLowerCase().includes(query))) : state.logs;
  renderLogFilterSummary(filters, rows.length);
  renderLogDiagnostics(rows, filters);
  const logCountText = filters.active
    ? '显示 ' + fmt(rows.length) + ' / 载入 ' + fmt(state.logs.length) + ' 条'
    : '已载入 ' + fmt(rows.length) + ' 条';
  const logCountEl = el('logCount');
  if (logCountEl) {
    const logCountNext = filters.active
      ? (rows.length ? '可点 requestId 查看链路或清除筛选' : '可清除筛选或调整条件')
      : (state.logs.length ? '可搜索 requestId 或按路径/状态筛选' : '可刷新日志或发起探测请求');
    logCountEl.textContent = logCountText;
    logCountEl.setAttribute('role', 'status');
    logCountEl.setAttribute('aria-live', 'polite');
    logCountEl.setAttribute('aria-atomic', 'true');
    logCountEl.setAttribute('aria-label', '请求日志：' + logCountText + (filters.active ? '（筛选中）' : '') + '。' + logCountNext);
  }
  const logPagerText = '当前显示 ' + fmt(rows.length) + ' 条 · 已载入 ' + fmt(state.logs.length) + ' 条日志';
  const logPagerEl = el('logPager');
  if (logPagerEl) {
    const logPagerNext = filters.active
      ? '当前为筛选匹配结果，非分页'
      : '最近载入窗口，非分页，可刷新扩展';
    logPagerEl.textContent = logPagerText;
    logPagerEl.setAttribute('role', 'status');
    logPagerEl.setAttribute('aria-live', 'polite');
    logPagerEl.setAttribute('aria-atomic', 'true');
    logPagerEl.setAttribute('aria-label', '日志分页：' + logPagerText + (filters.active ? '（筛选中）' : '') + '。' + logPagerNext);
  }
  const pagerHint = el('logPagerHint');
  if (pagerHint) {
    pagerHint.textContent = filters.active
      ? '匹配筛选 · 非分页'
      : '最近载入窗口 · 非分页';
  }
  if (!rows.length) {
    el('logsBody').innerHTML = '<tr><td colspan="11" class="empty log-empty-cell">' + renderLogEmptyState(filters.active || state.logs.length ? 'filtered' : 'empty') + '</td></tr>';
    return;
  }
  el('logsBody').innerHTML = rows.map((log) => {
    const statusClass = httpStatusClass(log.status);
    const requestId = String(log.requestId || '-');
    const shortRequestId = requestIdLabel(requestId);
    const queryText = log.query || '';
    const statusText = String(log.status || '-');
    const statusNext = Number(log.status) >= 400
      ? '可点 requestId 展开链路并定位失败密钥'
      : '可点 requestId 展开尝试顺序与密钥链';
    const statusAria = '请求 ' + shortRequestId + ' 状态：' + statusText + '。' + statusNext;
    return '<tr>' +
      '<td>' + esc(stamp(log.createdAt)) + '</td><td class="mono"><button class="link-btn" data-trace-id="' + esc(requestId) + '" title="' + esc('查看请求 ' + shortRequestId + ' 链路。可展开尝试顺序与密钥链') + '" aria-label="查看请求 ' + esc(shortRequestId) + ' 链路。可展开尝试顺序与密钥链">' + esc(shortRequestId) + '</button></td><td>' + esc(log.method) + '</td><td class="mono log-path">' + esc(log.path) + '</td>' +
      '<td class="log-query" title="' + esc(queryText) + '">' + esc(truncate(queryText, 60)) + '</td>' +
      '<td><span class="badge ' + statusClass + '" aria-label="' + esc(statusAria) + '">' + esc(statusText) + '</span></td>' +
      '<td aria-label="延迟：' + esc(ms(log.latencyMs)) + '。可点 requestId 展开链路对照耗时">' + esc(ms(log.latencyMs)) + '</td>' +
      '<td aria-label="尝试次数：' + fmt(log.attempts) + '。可点 requestId 查看重试顺序">' + fmt(log.attempts) + '</td>' +
      '<td class="mono log-chain">' + keyChainMarkup(log) + '</td>' +
      '<td class="mono" aria-label="客户端令牌：' + esc(log.tokenId || '-') + '。可对照审计或筛选同令牌请求">' + esc(log.tokenId || '-') + '</td>' +
      '<td aria-label="错误码：' + esc(labelOf(log.errorCode)) + '。' + (log.errorCode ? '可点 requestId 展开链路定位失败' : '当前无错误码，可继续观察') + '">' + esc(labelOf(log.errorCode)) + '</td>' +
    '</tr>';
  }).join('');
}

export function renderLogTrace() {
  const panel = el('tracePanel');
  if (!panel) return;
  const trace = state.trace;
  if (!trace || !trace.requestId) {
    panel.className = 'trace-panel is-idle';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', '请求链路面板：待选择。可点击日志中的 requestId 展开尝试顺序与密钥链');
    panel.innerHTML = renderTraceEmptyState('idle');
    return;
  }
  const rows = trace.trace || [];
  panel.className = 'trace-panel ' + (rows.length ? 'is-active' : 'is-missing');
  panel.setAttribute('role', 'region');
  panel.setAttribute(
    'aria-label',
    rows.length
      ? ('请求链路面板：已展开 ' + esc(String(trace.requestId)) + '。可查看尝试顺序与密钥链，或点密钥打开详情')
      : ('请求链路面板：未找到 ' + esc(String(trace.requestId)) + ' 的记录。可清除筛选或刷新日志后重试')
  );
  panel.innerHTML =
    (rows.length ? renderTraceSummary(trace, rows) : '<div class="trace-head"><span>请求链路 <span class="mono">' + esc(trace.requestId) + '</span></span><span>0 条记录</span></div>') +
    '<div class="trace-list">' + (rows.length ? rows.map((log) => {
      const statusClass = httpStatusClass(log.status);
      const queryHint = log.query ? ' · ' + esc(truncate(log.query, 40)) : '';
      const statusText = String(log.status || '-');
      const statusNext = Number(log.status) >= 400
        ? '可点密钥链路打开详情，或回日志按状态筛选'
        : '可继续查看尝试顺序，或点密钥打开详情';
      const statusAria = '链路步骤状态：' + statusText + '。' + statusNext;
      return '<div class="trace-item"><span>' + esc(stamp(log.createdAt)) + '</span><span class="trace-item-main"><span class="mono">' + esc(log.method) + ' ' + esc(log.path) + queryHint + '</span>' + keyChainMarkup(log) + '</span><span class="badge ' + statusClass + '" aria-label="' + esc(statusAria) + '">' + esc(statusText) + '</span></div>';
    }).join('') : renderTraceEmptyState('missing', trace.requestId)) + '</div>';
}
