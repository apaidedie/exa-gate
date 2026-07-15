import { el, esc, fmt, httpStatusClass, labelOf, ms, pct, stamp, state } from '../state.js';
import {
  filterChipMarkup,
  keyChainMarkup,
  latencyMs,
  logStatusLabel,
  requestIdLabel,
  summarizeLogRows,
  truncate
} from './render-shared.js';

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
  const resetAction = filters.active ? '清除日志筛选，恢复最近请求日志。可继续搜索 requestId 或按路径/状态筛选' : '刷新最近请求日志';
  const errorAction = summary.errors ? '筛选异常请求日志并查看链路' : '当前可见日志没有异常请求，可继续观察或刷新日志';
  const rateLimitAction = summary.rateLimits ? '筛选 429 请求日志并收窄路径' : '当前可见日志没有 429 请求，可继续观察或刷新日志';
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
  const title = isFiltered ? '没有匹配的日志' : '还没有请求';
  const message = isFiltered
    ? '换个筛选条件，或清除筛选。'
    : '用客户端令牌打一次代理接口即可。';
  const chips = isFiltered
    ? ['清除筛选', '调整条件', '刷新日志']
    : ['刷新日志', '发起请求', '可导出 CSV'];
  const actions = isFiltered
    ? '<div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="clear-log-filters" aria-label="清除请求日志筛选，恢复最近日志。可继续搜索 requestId 或按路径/状态筛选">清除筛选</button><span>恢复最近请求日志</span></div>'
    : '<div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="refresh-logs" aria-label="刷新请求日志，重新载入最近窗口。可继续点 requestId 看链路或调整筛选">刷新日志</button><span>重新载入最近请求窗口</span></div>';
  return '<div class="log-empty-state ' + esc(kind) + '"><div class="empty-kicker" aria-hidden="true">请求日志</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' + actions + '</div>';
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
  const logsPanel = document.querySelector('[data-tab-panel="logs"]');
  if (logsPanel instanceof HTMLElement) {
    logsPanel.dataset.logsEmpty = rows.length ? 'false' : 'true';
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
    const timeText = stamp(log.createdAt);
    const methodText = String(log.method || '-');
    const pathText = String(log.path || '-');
    return '<tr>' +
      '<td aria-label="请求时间：' + esc(timeText) + '。可点 requestId 展开链路对照时间">' + esc(timeText) + '</td>' +
      '<td class="mono"><button class="link-btn" data-trace-id="' + esc(requestId) + '" title="' + esc('查看请求 ' + shortRequestId + ' 链路。可展开尝试顺序与密钥链') + '" aria-label="查看请求 ' + esc(shortRequestId) + ' 链路。可展开尝试顺序与密钥链">' + esc(shortRequestId) + '</button></td>' +
      '<td aria-label="请求方法：' + esc(methodText) + '。可点 requestId 展开链路查看尝试顺序">' + esc(methodText) + '</td>' +
      '<td class="mono log-path" aria-label="请求路径：' + esc(pathText) + '。可按路径筛选日志或点 requestId 展开链路">' + esc(pathText) + '</td>' +
      '<td class="log-query" title="' + esc(queryText || '暂无查询参数') + '" aria-label="查询参数：' + esc(queryText || '暂无') + '。' + (queryText ? '可点 requestId 展开链路对照查询' : '可继续观察请求，或按路径筛选') + '">' + esc(truncate(queryText, 60) || '-') + '</td>' +
      '<td><span class="badge ' + statusClass + '" aria-label="' + esc(statusAria) + '">' + esc(statusText) + '</span></td>' +
      '<td aria-label="延迟：' + esc(ms(log.latencyMs)) + '。可点 requestId 展开链路对照耗时">' + esc(ms(log.latencyMs)) + '</td>' +
      '<td aria-label="尝试次数：' + fmt(log.attempts) + '。可点 requestId 查看重试顺序">' + fmt(log.attempts) + '</td>' +
      '<td class="mono log-chain">' + keyChainMarkup(log) + '</td>' +
      '<td class="mono" aria-label="客户端令牌：' + esc(log.tokenId || '-') + '。可对照审计或筛选同令牌请求">' + esc(log.tokenId || '-') + '</td>' +
      '<td aria-label="错误码：' + esc(labelOf(log.errorCode)) + '。' + (log.errorCode ? '可点 requestId 展开链路定位失败' : '当前无错误码，可继续观察') + '">' + esc(labelOf(log.errorCode)) + '</td>' +
    '</tr>';
  }).join('');
}
