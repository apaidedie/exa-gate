import { displayLabelById, el, esc, fmt, httpStatusClass, labelOf, ms, stamp, state } from './state.js';

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export function renderAudit() {
  const rows = state.audit || [];
  el('auditList').innerHTML = rows.length ? rows.map((item) => '<div class="audit-item"><div class="audit-title"><span>' + esc(item.action) + '</span><span class="badge ' + (item.success ? 'good' : 'bad') + '">' + (item.success ? '成功' : '失败') + '</span></div><div class="audit-meta">' + esc(stamp(item.createdAt)) + ' · ' + esc(item.actorTokenId || '-') + ' · ' + esc(item.targetId || '-') + '</div><div class="audit-meta">' + esc(item.detail || item.ip || '-') + '</div></div>').join('') : '<div class="empty">暂无审计记录。</div>';
}

export function renderLogs() {
  const query = el('logSearch').value.toLowerCase();
  const rows = query ? state.logs.filter((log) => [log.method, log.path, log.query, log.tokenId, log.requestId, log.errorCode, log.status].some((v) => String(v ?? '').toLowerCase().includes(query))) : state.logs;
  el('logCount').textContent = '已载入 ' + fmt(rows.length) + ' 条';
  el('logPager').textContent = '显示 ' + fmt(rows.length) + ' / ' + fmt(state.logs.length) + ' 条日志';
  if (!rows.length) {
    el('logsBody').innerHTML = '<tr><td colspan="11" class="empty">没有匹配的日志。</td></tr>';
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
    panel.innerHTML = '<div class="empty">选择请求 ID 查看完整链路。</div>';
    return;
  }
  const rows = trace.trace || [];
  panel.innerHTML =
    '<div class="trace-head"><span>请求链路 <span class="mono">' + esc(trace.requestId) + '</span></span><span>' + fmt(rows.length) + ' 条记录</span></div>' +
    '<div class="trace-list">' + (rows.length ? rows.map((log) => {
      const statusClass = httpStatusClass(log.status);
      const queryHint = log.query ? ' · ' + esc(truncate(log.query, 40)) : '';
      return '<div class="trace-item"><span>' + esc(stamp(log.createdAt)) + '</span><span class="mono">' + esc(log.method) + ' ' + esc(log.path) + queryHint + ' · ' + esc(Array.isArray(log.keyIds) ? log.keyIds.map(displayLabelById).join(' → ') : '-') + '</span><span class="badge ' + statusClass + '">' + esc(log.status) + '</span></div>';
    }).join('') : '<div class="empty">没有找到同 requestId 的链路记录。</div>') + '</div>';
}
