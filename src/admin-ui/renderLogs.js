import { displayLabelById, el, esc, fmt, httpStatusClass, labelOf, ms, pct, stamp, state } from './state.js';

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
  el('logVisibleCount').textContent = fmt(rows.length);
  el('logVisibleHint').textContent = filters.active ? '匹配筛选' : rows.length ? '最近载入' : '暂无样本';
  el('logErrorCount').className = summary.errors ? 'bad' : 'good';
  el('logErrorCount').textContent = fmt(summary.errors);
  el('logErrorRate').textContent = pct(summary.errors, rows.length);
  el('logRateLimitCount').className = summary.rateLimits ? 'warn' : 'good';
  el('logRateLimitCount').textContent = fmt(summary.rateLimits);
  el('logRateLimitRate').textContent = pct(summary.rateLimits, rows.length);
  el('logSlowestLatency').textContent = slowest ? ms(latencyMs(slowest)) : '0 毫秒';
  el('logSlowestPath').textContent = slowest ? truncate(String(slowest.path || '-'), 28) : '等待样本';
  syncLogDiagnosticAction('reset', false, filters.active ? '清除日志筛选，恢复最近请求日志' : '刷新最近请求日志');
  syncLogDiagnosticAction('errors', summary.errors === 0, summary.errors ? '筛选 ' + fmt(summary.errors) + ' 条异常请求日志' : '当前可见日志没有异常请求');
  syncLogDiagnosticAction('rate-limit', summary.rateLimits === 0, summary.rateLimits ? '筛选 ' + fmt(summary.rateLimits) + ' 条 429 请求日志' : '当前可见日志没有 429 请求');
  syncLogDiagnosticAction('slowest', !slowestPath, slowestPath ? '按最慢请求路径 ' + slowestPath + ' 筛选日志' : '暂无最慢请求样本');
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
  if (query) filters.push({ label: '关键词', value: query });
  if (path) filters.push({ label: '路径', value: path });
  if (key) filters.push({ label: '密钥', value: key });
  if (status) filters.push({ label: '状态', value: logStatusLabel(status) });
  return { query, path, key, status, filters, active: filters.length > 0 };
}

function renderLogFilterSummary(filters, visibleCount) {
  const summary = el('logFilterSummary');
  if (!summary) return;
  const chips = el('logFilterChips');
  const text = el('logFilterSummaryText');
  const clearButton = el('clearLogFilters');
  summary.classList.toggle('is-empty', !filters.active);
  if (text) {
    text.textContent = filters.active
      ? '当前显示 ' + fmt(visibleCount) + ' 条匹配日志。导出会沿用路径、密钥和状态筛选，关键词只影响当前表格。'
      : '当前显示最近请求日志，可按关键词、路径、密钥或状态收窄。';
  }
  if (chips) {
    chips.innerHTML = filters.active
      ? filters.filters.map((filter) => '<span class="log-filter-chip"><strong>' + esc(filter.label) + '</strong>' + esc(filter.value) + '</span>').join('')
      : '<span class="log-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filters.active;
}

function renderLogEmptyState(kind) {
  const isFiltered = kind === 'filtered';
  const title = isFiltered ? '没有匹配的请求日志' : '暂无请求日志';
  const message = isFiltered
    ? '当前筛选条件没有命中记录。调整关键词、路径、密钥或状态后继续排查。'
    : '代理收到客户端请求后，会在这里记录状态、延迟、尝试次数和密钥链路。';
  const chips = isFiltered
    ? ['检查筛选', '清空关键词', '刷新日志']
    : ['等待请求', '保留窗口', '可导出 CSV'];
  return '<div class="log-empty-state ' + esc(kind) + '"><div class="empty-kicker">请求日志</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div></div>';
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
    return '<button class="trace-shortcut" type="button" data-trace-id="' + esc(id) + '" title="' + esc(id) + '" aria-label="查看最近请求 ' + esc(label) + ' 链路，状态 ' + esc(log.status) + '"><span class="mono">' + esc(label) + '</span><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></button>';
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
  return '<div class="trace-summary"><div class="trace-summary-title"><span>请求链路</span><strong class="mono">' + esc(trace.requestId) + '</strong></div><div class="trace-summary-grid">' +
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
    ? '该 requestId 没有返回关联记录。日志可能已被清理，或当前请求没有形成多次尝试链路。'
    : '点击请求日志中的 requestId，可展开该请求的尝试顺序、上游路径、状态码和密钥链路。';
  const chips = hasRequest ? ['检查保留窗口', '确认 requestId', '重新筛选日志'] : ['点击 requestId', '查看重试链路', '定位失败密钥'];
  return '<div class="trace-empty-state ' + esc(kind) + '"><div class="empty-kicker">链路诊断</div><div class="trace-empty-copy"><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p></div>' +
    (hasRequest ? '<div class="trace-empty-request"><span>requestId</span><strong class="mono">' + esc(requestId) + '</strong></div>' : '') +
    '<div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' + renderTraceShortcuts() + '</div>';
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
  if (query) filters.push({ label: '关键词', value: query });
  if (action) filters.push({ label: '动作', value: auditActionLabel(action) });
  if (outcome) filters.push({ label: '结果', value: auditOutcomeLabel(outcome) });
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
  summary.classList.toggle('is-empty', !filters.active);
  if (text) {
    text.textContent = filters.active
      ? '当前显示 ' + fmt(visibleCount) + ' 条匹配审计。导出会沿用动作和结果筛选，关键词只影响当前列表。'
      : '当前显示最近管理员审计，可按关键词、动作或结果收窄。';
  }
  if (chips) {
    chips.innerHTML = filters.active
      ? filters.filters.map((filter) => '<span class="audit-filter-chip"><strong>' + esc(filter.label) + '</strong>' + esc(filter.value) + '</span>').join('')
      : '<span class="audit-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filters.active;
}

function renderAuditSummary(rows) {
  const total = rows.length;
  const success = rows.filter((item) => item.success).length;
  const failure = total - success;
  const latest = rows[0] || null;
  const latestAction = latest ? auditActionLabel(latest.action) : '等待审计记录';
  const latestTime = latest ? stamp(latest.createdAt) : '刷新后显示最近管理员动作';
  if (el('auditTotal')) el('auditTotal').textContent = fmt(total);
  if (el('auditSuccess')) el('auditSuccess').textContent = fmt(success);
  if (el('auditFailure')) el('auditFailure').textContent = fmt(failure);
  if (el('auditLatest')) el('auditLatest').textContent = total ? latestAction + ' · ' + latestTime : latestAction;
}

function renderAuditEvidence(rows, filters = { active: false }) {
  const total = rows.length;
  const failures = rows.filter((item) => !item.success).length;
  const latest = rows[0] || null;
  const latestAction = latest ? auditActionLabel(latest.action) : '等待动作';
  const latestActor = latest?.actorTokenId || '-';
  const exportReady = total > 0;
  const failureEl = el('auditEvidenceFailures');
  const exportEl = el('auditEvidenceExport');
  el('auditEvidenceTotal').textContent = fmt(total);
  el('auditEvidenceWindow').textContent = total ? (filters.active ? '当前匹配 ' + fmt(total) + ' 条' : '当前载入最近 ' + fmt(total) + ' 条') : (filters.active ? '当前筛选无命中' : '刷新后显示最近动作');
  if (failureEl) {
    failureEl.className = failures ? 'bad' : 'good';
    failureEl.textContent = fmt(failures);
  }
  el('auditEvidenceFailureRate').textContent = pct(failures, total);
  el('auditEvidenceActor').textContent = latestActor;
  el('auditEvidenceAction').textContent = latest ? latestAction + ' · ' + stamp(latest.createdAt) : latestAction;
  if (exportEl) {
    exportEl.className = exportReady ? 'good' : 'warn';
    exportEl.textContent = exportReady ? '可导出' : '待生成';
  }
  el('auditEvidenceExportHint').textContent = exportReady ? (filters.action || filters.outcome ? '导出沿用动作与结果筛选' : '导出当前审计 CSV 证据') : '暂无可导出审计记录';
}

function renderAuditEmptyState(kind = 'empty') {
  const isFiltered = kind === 'filtered';
  const title = isFiltered ? '没有匹配的审计记录' : '暂无审计记录';
  const message = isFiltered
    ? '当前筛选条件没有命中记录。清除关键词、动作或结果筛选后恢复最近审计列表。'
    : '管理员登录、导出、密钥操作和日志治理动作会在这里形成可导出的证据链。';
  const chips = isFiltered ? ['检查筛选', '清除筛选', '刷新审计'] : ['登录记录', '密钥动作', '导出证据'];
  return '<div class="audit-empty-state ' + esc(kind) + '"><div class="empty-kicker">管理员审计</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div></div>';
}

export function renderAudit() {
  const filters = auditFilterState();
  const sourceRows = state.audit || [];
  const rows = filterAuditRows(sourceRows, filters);
  renderAuditSummary(rows);
  renderAuditEvidence(rows, filters);
  renderAuditFilterSummary(filters, rows.length);
  el('auditList').innerHTML = rows.length ? rows.map((item) => {
    const rawAction = String(item.action || 'unknown_action');
    const label = auditActionLabel(rawAction);
    const tone = item.success ? 'good' : 'bad';
    return '<div class="audit-item ' + tone + '"><div class="audit-title"><span class="audit-action"><span>' + esc(label) + '</span><code class="audit-action-code">' + esc(rawAction) + '</code></span><span class="badge ' + tone + '">' + (item.success ? '成功' : '失败') + '</span></div><div class="audit-meta-grid"><span><strong>时间</strong>' + esc(stamp(item.createdAt)) + '</span><span><strong>操作者</strong>' + esc(item.actorTokenId || '-') + '</span><span><strong>目标</strong>' + esc(item.targetId || '-') + '</span></div><div class="audit-detail">' + esc(item.detail || item.ip || '无附加详情') + '</div></div>';
  }).join('') : renderAuditEmptyState(filters.active || sourceRows.length ? 'filtered' : 'empty');
}

export function renderLogs() {
  const filters = logFilterState();
  const query = filters.query.toLowerCase();
  const rows = query ? state.logs.filter((log) => [log.method, log.path, log.query, log.tokenId, log.requestId, log.errorCode, log.status].some((v) => String(v ?? '').toLowerCase().includes(query))) : state.logs;
  renderLogFilterSummary(filters, rows.length);
  renderLogDiagnostics(rows, filters);
  el('logCount').textContent = filters.active ? '显示 ' + fmt(rows.length) + ' / 载入 ' + fmt(state.logs.length) + ' 条' : '已载入 ' + fmt(rows.length) + ' 条';
  el('logPager').textContent = '当前显示 ' + fmt(rows.length) + ' 条 · 已载入 ' + fmt(state.logs.length) + ' 条日志';
  if (!rows.length) {
    el('logsBody').innerHTML = '<tr><td colspan="11" class="empty log-empty-cell">' + renderLogEmptyState(filters.active || state.logs.length ? 'filtered' : 'empty') + '</td></tr>';
    return;
  }
  el('logsBody').innerHTML = rows.map((log) => {
    const statusClass = httpStatusClass(log.status);
    const requestId = String(log.requestId || '-');
    const shortRequestId = requestIdLabel(requestId);
    const queryText = log.query || '';
    return '<tr>' +
      '<td>' + esc(stamp(log.createdAt)) + '</td><td class="mono"><button class="link-btn" data-trace-id="' + esc(requestId) + '" title="' + esc(requestId) + '" aria-label="查看请求 ' + esc(shortRequestId) + ' 链路">' + esc(shortRequestId) + '</button></td><td>' + esc(log.method) + '</td><td class="mono log-path">' + esc(log.path) + '</td>' +
      '<td class="log-query" title="' + esc(queryText) + '">' + esc(truncate(queryText, 60)) + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></td><td>' + esc(ms(log.latencyMs)) + '</td><td>' + fmt(log.attempts) + '</td>' +
      '<td class="mono log-chain">' + esc(keyChainText(log)) + '</td><td class="mono">' + esc(log.tokenId || '-') + '</td><td>' + esc(labelOf(log.errorCode)) + '</td>' +
    '</tr>';
  }).join('');
}

export function renderLogTrace() {
  const panel = el('tracePanel');
  if (!panel) return;
  const trace = state.trace;
  if (!trace || !trace.requestId) {
    panel.className = 'trace-panel is-idle';
    panel.innerHTML = renderTraceEmptyState('idle');
    return;
  }
  const rows = trace.trace || [];
  panel.className = 'trace-panel ' + (rows.length ? 'is-active' : 'is-missing');
  panel.innerHTML =
    (rows.length ? renderTraceSummary(trace, rows) : '<div class="trace-head"><span>请求链路 <span class="mono">' + esc(trace.requestId) + '</span></span><span>0 条记录</span></div>') +
    '<div class="trace-list">' + (rows.length ? rows.map((log) => {
      const statusClass = httpStatusClass(log.status);
      const queryHint = log.query ? ' · ' + esc(truncate(log.query, 40)) : '';
      return '<div class="trace-item"><span>' + esc(stamp(log.createdAt)) + '</span><span class="mono">' + esc(log.method) + ' ' + esc(log.path) + queryHint + ' · ' + esc(keyChainText(log)) + '</span><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></div>';
    }).join('') : renderTraceEmptyState('missing', trace.requestId)) + '</div>';
}
