import { displayLabelById, el, esc, fmt, httpStatusClass, ms, stamp, state } from '../state.js';
import {
  keyChainMarkup,
  latencyMs,
  requestIdLabel,
  truncate
} from './render-shared.js';

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
    '</div><div class="trace-chain" aria-label="密钥链路：' + esc(summary.keyChain) + '。可点密钥打开详情复核，或回日志按密钥筛选"><span>密钥链路</span><strong class="mono">' + esc(summary.keyChain) + '</strong></div></div>';
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
      + '<button class="primary-btn" type="button" data-empty-action="clear-log-filters" aria-label="清除请求日志筛选，恢复最近日志后重新点选。可点 requestId 展开链路">清除筛选</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="refresh-logs" aria-label="刷新请求日志，重新载入最近窗口。可继续点 requestId 看链路或调整筛选">刷新日志</button>'
      + '<span>恢复最近请求后重新点选</span>'
      + '</div>'
    : '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="refresh-logs" aria-label="刷新请求日志，重新载入最近窗口。可继续点 requestId 看链路或调整筛选">刷新日志</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="focus-log-search" aria-label="聚焦 requestId 搜索框，输入后收窄日志。可继续点 requestId 看链路">搜索 requestId</button>'
      + '<span>或在表格中点击 requestId</span>'
      + '</div>';
  return '<div class="trace-empty-state ' + esc(kind) + '"><div class="empty-kicker" aria-hidden="true">链路诊断</div><div class="trace-empty-copy"><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p></div>' +
    (hasRequest ? '<div class="trace-empty-request"><span>requestId</span><strong class="mono">' + esc(requestId) + '</strong></div>' : '') +
    '<div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' +
    actions + renderTraceShortcuts() + '</div>';
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
  const summary = rows.length ? summarizeTrace(rows) : null;
  const hero = rows.length && summary
    ? '<div class="trace-hero" aria-label="链路摘要：' + esc(String(summary.path)) + ' · 状态 ' + esc(summary.finalStatus) + ' · ' + fmt(summary.attempts) + ' 次尝试">'
      + '<span class="trace-hero-kicker" aria-hidden="true">链路详情</span>'
      + '<strong class="mono">' + esc(String(summary.path)) + '</strong>'
      + '<span class="badge ' + summary.finalTone + '" aria-hidden="true">' + esc(summary.finalStatus) + '</span>'
      + '<small>' + fmt(summary.attempts) + ' 次尝试 · ' + esc(summary.duration) + '</small>'
      + '</div>'
    : '';
  panel.innerHTML =
    hero +
    (rows.length
      ? renderTraceSummary(trace, rows)
      : '<div class="trace-head" role="status" aria-live="polite" aria-atomic="true" aria-label="请求链路 ' + esc(String(trace.requestId || '-')) + '：0 条记录。可清除筛选或刷新日志后重试"><span>请求链路 <span class="mono">' + esc(trace.requestId) + '</span></span><span>0 条记录</span></div>') +
    '<div class="trace-list">' + (rows.length ? rows.map((log) => {
      const statusClass = httpStatusClass(log.status);
      const queryHint = log.query ? ' · ' + esc(truncate(log.query, 40)) : '';
      const statusText = String(log.status || '-');
      const timeText = stamp(log.createdAt);
      const statusNext = Number(log.status) >= 400
        ? '可点密钥链路打开详情，或回日志按状态筛选'
        : '可继续查看尝试顺序，或点密钥打开详情';
      const statusAria = '链路步骤状态：' + statusText + '。' + statusNext;
      const pathLabel = String(log.method || '-') + ' ' + String(log.path || '-') + (log.query ? ' · ' + truncate(log.query, 40) : '');
      const pathNext = Number(log.status) >= 400
        ? '可点密钥打开详情，或回日志按路径筛选'
        : '可继续查看尝试顺序，或点密钥打开详情';
      return '<div class="trace-item"><span aria-label="链路步骤时间：' + esc(timeText) + '。可对照状态与密钥链路">' + esc(timeText) + '</span><span class="trace-item-main"><span class="mono" aria-label="链路步骤路径：' + esc(pathLabel) + '。' + pathNext + '">' + esc(log.method) + ' ' + esc(log.path) + queryHint + '</span>' + keyChainMarkup(log) + '</span><span class="badge ' + statusClass + '" aria-label="' + esc(statusAria) + '">' + esc(statusText) + '</span></div>';
    }).join('') : renderTraceEmptyState('missing', trace.requestId)) + '</div>';
}
