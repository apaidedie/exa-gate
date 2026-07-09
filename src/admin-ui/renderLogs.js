import { displayLabelById, el, esc, fmt, httpStatusClass, labelOf, ms, stamp, state } from './state.js';

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function logStatusLabel(value) {
  return { success: '成功', error: '异常', '4xx': '4xx', '5xx': '5xx', 429: '429' }[value] || value;
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
    const label = id.length > 18 ? id.slice(0, 8) + '...' + id.slice(-6) : id;
    return '<button class="trace-shortcut" type="button" data-trace-id="' + esc(id) + '" title="' + esc(id) + '"><span class="mono">' + esc(label) + '</span><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></button>';
  }).join('') + '</div></div>';
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

function auditActionLabel(action) {
  const labels = {
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
  const key = String(action || '').trim();
  if (!key) return '未知审计操作';
  if (labels[key]) return labels[key];
  if (key.startsWith('batch_')) return '批量操作';
  return key.replace(/_/g, ' ');
}

export function renderAudit() {
  const rows = state.audit || [];
  el('auditList').innerHTML = rows.length ? rows.map((item) => {
    const rawAction = String(item.action || 'unknown_action');
    const label = auditActionLabel(rawAction);
    return '<div class="audit-item"><div class="audit-title"><span class="audit-action"><span>' + esc(label) + '</span><code class="audit-action-code">' + esc(rawAction) + '</code></span><span class="badge ' + (item.success ? 'good' : 'bad') + '">' + (item.success ? '成功' : '失败') + '</span></div><div class="audit-meta">' + esc(stamp(item.createdAt)) + ' · ' + esc(item.actorTokenId || '-') + ' · ' + esc(item.targetId || '-') + '</div><div class="audit-meta">' + esc(item.detail || item.ip || '-') + '</div></div>';
  }).join('') : '<div class="empty">暂无审计记录。</div>';
}

export function renderLogs() {
  const filters = logFilterState();
  const query = filters.query.toLowerCase();
  const rows = query ? state.logs.filter((log) => [log.method, log.path, log.query, log.tokenId, log.requestId, log.errorCode, log.status].some((v) => String(v ?? '').toLowerCase().includes(query))) : state.logs;
  renderLogFilterSummary(filters, rows.length);
  el('logCount').textContent = filters.active ? '显示 ' + fmt(rows.length) + ' / 载入 ' + fmt(state.logs.length) + ' 条' : '已载入 ' + fmt(rows.length) + ' 条';
  el('logPager').textContent = '当前显示 ' + fmt(rows.length) + ' 条 · 已载入 ' + fmt(state.logs.length) + ' 条日志';
  if (!rows.length) {
    el('logsBody').innerHTML = '<tr><td colspan="11" class="empty log-empty-cell">' + renderLogEmptyState(filters.active || state.logs.length ? 'filtered' : 'empty') + '</td></tr>';
    return;
  }
  el('logsBody').innerHTML = rows.map((log) => {
    const statusClass = httpStatusClass(log.status);
    const requestId = String(log.requestId || '-');
    const shortRequestId = requestId.length > 16 ? requestId.slice(0, 7) + '...' + requestId.slice(-6) : requestId;
    const queryText = log.query || '';
    return '<tr>' +
      '<td>' + esc(stamp(log.createdAt)) + '</td><td class="mono"><button class="link-btn" data-trace-id="' + esc(requestId) + '" title="' + esc(requestId) + '">' + esc(shortRequestId) + '</button></td><td>' + esc(log.method) + '</td><td class="mono log-path">' + esc(log.path) + '</td>' +
      '<td class="log-query" title="' + esc(queryText) + '">' + esc(truncate(queryText, 60)) + '</td>' +
      '<td><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></td><td>' + esc(ms(log.latencyMs)) + '</td><td>' + fmt(log.attempts) + '</td>' +
      '<td class="mono log-chain">' + esc(Array.isArray(log.keyIds) ? log.keyIds.map(displayLabelById).join(' → ') : '-') + '</td><td class="mono">' + esc(log.tokenId || '-') + '</td><td>' + esc(labelOf(log.errorCode)) + '</td>' +
    '</tr>';
  }).join('');
}

export function renderLogTrace() {
  const panel = el('tracePanel');
  if (!panel) return;
  const trace = state.trace;
  if (!trace || !trace.requestId) {
    panel.innerHTML = renderTraceEmptyState('idle');
    return;
  }
  const rows = trace.trace || [];
  panel.innerHTML =
    '<div class="trace-head"><span>请求链路 <span class="mono">' + esc(trace.requestId) + '</span></span><span>' + fmt(rows.length) + ' 条记录</span></div>' +
    '<div class="trace-list">' + (rows.length ? rows.map((log) => {
      const statusClass = httpStatusClass(log.status);
      const queryHint = log.query ? ' · ' + esc(truncate(log.query, 40)) : '';
      return '<div class="trace-item"><span>' + esc(stamp(log.createdAt)) + '</span><span class="mono">' + esc(log.method) + ' ' + esc(log.path) + queryHint + ' · ' + esc(Array.isArray(log.keyIds) ? log.keyIds.map(displayLabelById).join(' → ') : '-') + '</span><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></div>';
    }).join('') : renderTraceEmptyState('missing', trace.requestId)) + '</div>';
}
