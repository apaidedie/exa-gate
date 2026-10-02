import { displayLabelById, el, esc, fmt, state } from '../state.js';

// Console audit list loads a recent non-paginated window (see admin.js ?limit=).
export const AUDIT_LIST_WINDOW = 12;

export function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export function logStatusLabel(value) {
  return { success: '成功', error: '异常', '4xx': '4xx', '5xx': '5xx', 429: '429' }[value] || value;
}

export function numericStatus(log) {
  const status = Number(log?.status);
  return Number.isFinite(status) ? status : 0;
}

export function latencyMs(log) {
  const value = Number(log?.latencyMs || 0);
  return Number.isFinite(value) ? value : 0;
}

export function keyChainText(log) {
  return Array.isArray(log?.keyIds) ? log.keyIds.map(displayLabelById).join(' → ') : '-';
}

export function knownKey(id) {
  return state.keys.some((key) => key.id === id);
}

export function keyChainMarkup(log) {
  const ids = Array.isArray(log?.keyIds) ? log.keyIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) {
    return '<span class="log-key-chain is-empty" aria-label="密钥链路：暂无。可点 requestId 展开链路，或等待调度写入密钥">'
      + '<span aria-hidden="true">-</span>'
      + '</span>';
  }
  return '<span class="log-key-chain" aria-label="密钥链路：' + esc(ids.map(displayLabelById).join(' → ')) + '。可点密钥打开详情复核">' + ids.map((id, index) => {
    const label = displayLabelById(id);
    const separator = index > 0 ? '<span class="log-key-separator" aria-hidden="true">→</span>' : '';
    if (!knownKey(id)) return separator + '<span class="log-key-missing mono" aria-label="密钥 ' + esc(label) + ' 不在当前密钥池。可到密钥池搜索该 ID">' + esc(label) + '</span>';
    return separator + '<button class="log-key-link" type="button" data-log-key-action="open-detail" data-key-id="' + esc(id) + '" title="打开密钥 ' + esc(label) + ' 详情，可在侧栏复核用量与操作" aria-label="打开密钥 ' + esc(label) + ' 详情。可在侧栏复核用量与操作">' + esc(label) + '</button>';
  }).join('') + '</span>';
}

export function requestIdLabel(value) {
  const text = String(value || '-');
  if (text.length <= 12) return text;
  const compact = text.startsWith('req_') ? text.slice(4) : text;
  if (compact.length <= 12) return compact;
  return compact.slice(0, 3) + '...' + compact.slice(-4);
}

export function summarizeLogRows(rows) {
  return rows.reduce((summary, log) => {
    const status = numericStatus(log);
    const latency = latencyMs(log);
    if (status >= 400 || log.errorCode) summary.errors += 1;
    if (status === 429 || log.errorCode === 'rate_limit') summary.rateLimits += 1;
    if (!summary.slowest || latency > latencyMs(summary.slowest)) summary.slowest = log;
    return summary;
  }, { errors: 0, rateLimits: 0, slowest: null });
}

export function filterChipMarkup(kind, item) {
  return '<button type="button" class="' + kind + '-filter-chip is-removable" data-filter-remove="' + esc(item.key) + '" aria-label="移除' + esc(item.label) + '筛选：' + esc(item.value) + '。移除后刷新匹配结果"><strong>' + esc(item.label) + '</strong><span class="filter-chip-value">' + esc(item.value) + '</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>';
}
