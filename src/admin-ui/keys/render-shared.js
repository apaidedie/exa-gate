import { cooldownLeft, displayLabel, el, esc, fmt, labelOf, pct, state, statusOf } from '../state.js';

export function keyScopeText(filter, query) {
  const filterLabels = { All: '全部密钥', Healthy: '健康密钥', Cooldown: '冷却密钥', Disabled: '禁用密钥', Problem: '异常密钥' };
  const base = filterLabels[filter] || '全部密钥';
  if (!query && filter === 'All') return base;
  if (!query) return base;
  const searchText = '搜索 "' + query + '"';
  return filter === 'All' ? searchText : base + ' + ' + searchText;
}

export function keyFilterLabel(filter) {
  return { All: '全部', Healthy: '健康', Cooldown: '冷却', Disabled: '禁用', Problem: '异常' }[filter] || '全部';
}

export function keyFilterState(filter, query) {
  const filters = [];
  if (query) filters.push({ key: 'query', label: '关键词', value: query });
  if (filter && filter !== 'All') filters.push({ key: 'status', label: '状态', value: keyFilterLabel(filter) });
  return { filters, active: filters.length > 0 };
}

export function filterChipMarkup(kind, item) {
  return '<button type="button" class="' + kind + '-filter-chip is-removable" data-filter-remove="' + esc(item.key) + '" aria-label="移除' + esc(item.label) + '筛选：' + esc(item.value) + '。移除后刷新匹配结果"><strong>' + esc(item.label) + '</strong><span class="filter-chip-value">' + esc(item.value) + '</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>';
}

export function keyScopeHint(filter, query, totalPages) {
  if (!query && filter === 'All') return '未筛选';
  const pageHint = fmt(totalPages) + ' 页结果';
  if (query && filter !== 'All') return '组合筛选，' + pageHint;
  if (query) return '关键词范围，' + pageHint;
  return '状态筛选，' + pageHint;
}

export function keySortAriaLabel(label, isActive, direction) {
  if (!isActive) return '按' + label + '排序。点击后按升序排列密钥表';
  const current = direction === 'desc' ? '降序' : '升序';
  const next = direction === 'desc' ? '升序' : '降序';
  return '按' + label + '排序，当前' + current + '。再次点击切换为' + next;
}

export function sortKeyRows(rows) {
  if (!state.keySort.column) return rows;
  const col = state.keySort.column;
  const dir = state.keySort.direction === 'desc' ? -1 : 1;
  const sortMap = { requests: 'totalRequests', success: 'successCount', failures: 'failureCount', rateLimits: 'rateLimitCount', timeouts: 'timeoutCount' };
  const field = sortMap[col] || col;
  rows.sort((a, b) => (Number(a[field] || 0) - Number(b[field] || 0)) * dir);
  return rows;
}

export function keyRowSignal(key, status, observedRequests) {
  const failures = Number(key.failureCount || 0);
  const rateLimits = Number(key.rateLimitCount || 0);
  const timeouts = Number(key.timeoutCount || 0);
  if (status === 'Disabled') {
    return { tone: 'bad', label: '已停用', detail: '不参与调度' };
  }
  if (status === 'Cooldown') {
    const reason = labelOf(key.cooldownReason);
    const left = cooldownLeft(key.cooldownUntil);
    const detail = (reason === '-' ? '保护中' : reason) + (left === '-' ? '' : ' · ' + left);
    return { tone: 'warn', label: '冷却中', detail };
  }
  if (rateLimits > 0) {
    return { tone: 'warn', label: '429 压力', detail: fmt(rateLimits) + ' 次限流' };
  }
  if (timeouts > 0) {
    return { tone: 'warn', label: '超时压力', detail: fmt(timeouts) + ' 次超时' };
  }
  if (failures > 0) {
    return { tone: 'bad', label: '失败信号', detail: fmt(failures) + ' 次失败' };
  }
  if (!observedRequests) {
    return { tone: 'blue', label: '待样本', detail: '尚无请求' };
  }
  return { tone: 'good', label: '可调度', detail: pct(key.successCount, observedRequests) + ' 成功' };
}
