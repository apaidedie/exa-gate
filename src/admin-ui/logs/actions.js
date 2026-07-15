import { fetchLogs, fetchLogTrace } from '../api.js';
import { el, state } from '../state.js';
import { renderLogTrace, renderLogs } from '../renderLogs.js';
import { showToast } from '../ui/toast.js';
import { setButtonBusy, setButtonPending } from '../ui/busy.js';
import { scheduleControlFocus } from '../ui/focus.js';

export async function loadLogTrace(requestId) {
  const result = await fetchLogTrace(requestId);
  state.trace = result;
  renderLogTrace();
}

export async function reloadLogs(options = {}) {
  const restore = options.button ? setButtonPending(options.button, options.pendingText || '正在筛选') : () => {};
  try {
    const data = await fetchLogs();
    state.logs = data.logs || [];
    renderLogs();
    if (!state.trace?.requestId) renderLogTrace();
  } finally {
    restore();
  }
}

export async function applyLogStatusFilter(status, { focus = false, toast = '' } = {}) {
  el('logStatusFilter').value = status;
  state.trace = null;
  renderLogTrace();
  await reloadLogs();
  if (focus) scheduleControlFocus('logStatusFilter');
  if (toast) showToast(toast);
}

export async function applyLogKeyFilter(keyId, { focus = false, toast = '' } = {}) {
  el('logKeyFilter').value = keyId;
  state.trace = null;
  renderLogTrace();
  await reloadLogs();
  if (focus) scheduleControlFocus('logKeyFilter', { select: true });
  if (toast) showToast(toast);
}

export async function clearLogFilters() {
  el('logSearch').value = '';
  el('logPathFilter').value = '';
  el('logKeyFilter').value = '';
  el('logStatusFilter').value = '';
  state.trace = null;
  renderLogTrace();
  await reloadLogs({ button: el('clearLogFilters'), pendingText: '正在清除' });
  showToast('日志筛选已清除。可继续搜索 requestId，或按路径/状态收窄。');
}

export async function removeLogFilterDimension(dimension) {
  const labels = { query: '关键词', path: '路径', key: '密钥', status: '状态' };
  if (dimension === 'query') el('logSearch').value = '';
  else if (dimension === 'path') el('logPathFilter').value = '';
  else if (dimension === 'key') el('logKeyFilter').value = '';
  else if (dimension === 'status') el('logStatusFilter').value = '';
  else return;
  if (dimension === 'query') {
    renderLogs();
  } else {
    await reloadLogs();
  }
  showToast('已移除' + (labels[dimension] || '') + '筛选。可继续调整其他条件或刷新列表。');
}

export async function runLogDiagnosticAction(button) {
  const action = button?.dataset?.logDiagnosticAction || '';
  if (!action || button.disabled) return;
  const restore = setButtonBusy(button, action === 'reset' ? '正在重置筛选' : '正在筛选日志');
  try {
    if (action === 'reset') {
      await clearLogFilters();
      return;
    }
    if (action === 'errors') {
      await applyLogStatusFilter('error', { toast: '已筛选异常请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' });
      return;
    }
    if (action === 'rate-limit') {
      await applyLogStatusFilter('429', { toast: '已筛选 429 请求日志。可继续按路径收窄，或清除筛选恢复全部。' });
      return;
    }
    if (action === 'slowest') {
      const pathValue = button.dataset.logDiagnosticValue || '';
      if (!pathValue) {
        showToast('暂无最慢请求样本。请等待新请求写入日志后再试。', 'warn');
        return;
      }
      el('logPathFilter').value = pathValue;
      await reloadLogs();
      scheduleControlFocus('logPathFilter', { select: true });
      showToast('已按最慢请求路径筛选日志。可点 requestId 查看链路，或清除筛选恢复全部。');
    }
  } finally {
    restore();
    renderLogs();
  }
}
