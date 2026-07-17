import { el, state } from '../state.js';
import { showToast } from '../ui/toast.js';
import { setButtonBusy } from '../ui/busy.js';
import { applyLogStatusFilter } from '../logs/actions.js';
import { applyProblemKeyFilter } from '../keys/actions.js';
import { openImportModal } from '../keys/import.js';

export function createOverviewActions(deps) {
  const switchTab = (tab) => deps.switchTab(tab);
  const focusControlInTab = (tab, controlId) => deps.focusControlInTab(tab, controlId);

  function focusAlertTarget() {
    // Keep intent long enough for tab switch + SSE/refresh re-renders that replace #alertList buttons.
    state.alertFocusUntil = Date.now() + 3200;
    const applyFocus = () => {
      if (Date.now() > Number(state.alertFocusUntil || 0)) return;
      if (state.activeTab !== 'overview') return;
      const alertTarget = document.querySelector('#alertList button[data-overview-signal-action="alert-focus"]') || el('insightNextActionButton') || el('alertList');
      if (alertTarget && typeof alertTarget.focus === 'function') alertTarget.focus({ preventScroll: true });
    };
    // Double rAF covers overview paint; short retries cover list rebuild after refresh.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyFocus();
        if (state.alertFocusUntil && Date.now() <= Number(state.alertFocusUntil || 0)) {
          window.setTimeout(applyFocus, 48);
          window.setTimeout(applyFocus, 400);
        }
      });
    });
  }

  async function runOverviewAction(actionId, sourceButton = null) {
    if (!actionId || sourceButton?.disabled) return;
    const shouldMarkBusy = sourceButton && !sourceButton.dataset.overviewSignalAction && actionId !== 'import-keys';
    const restore = shouldMarkBusy ? setButtonBusy(sourceButton, '正在跳转') : () => {};
    try {
      if (actionId === 'import-keys') {
        switchTab('keys');
        openImportModal({ returnFocus: el('bulkImportBtn') });
        return;
      }
      if (actionId === 'keys') {
        focusControlInTab('keys', 'keySearch');
        showToast('已打开密钥池。可搜索 ID，或筛选健康/异常状态。');
        return;
      }
      if (actionId === 'keys-problem') {
        const hasKeyProblems = (state.problemKeyIds && state.problemKeyIds.length > 0)
          || state.keys.some((key) => !key.enabled || Number(key.cooldownUntil || 0) > Date.now() || Number(key.failureCount || 0) > 0);
        if (!hasKeyProblems) {
          switchTab('logs');
          await applyLogStatusFilter('error', { focus: true, toast: '当前无异常密钥，已打开失败请求日志。可点 requestId 看链路。' });
          return;
        }
        switchTab('keys');
        applyProblemKeyFilter();
        showToast('已筛选异常密钥。可批量测试/禁用，或清除筛选恢复全部。');
        return;
      }
      if (actionId === 'logs-focus') {
        focusControlInTab('logs', 'logSearch');
        showToast('已打开请求日志。可搜索 requestId，或按路径/状态筛选。');
        return;
      }
      if (actionId === 'log-errors') {
        switchTab('logs');
        await applyLogStatusFilter('error', { focus: true, toast: '已筛选异常请求日志。可点 requestId 查看链路，或清除筛选恢复全部。' });
        return;
      }
      if (actionId === 'log-rate-limit') {
        switchTab('logs');
        await applyLogStatusFilter('429', { focus: true, toast: '已筛选 429 请求日志。可继续按路径收窄，或清除筛选恢复全部。' });
        return;
      }
      if (actionId === 'alert-focus') {
        focusAlertTarget();
        showToast('已聚焦告警建议。可按提示处理，或切换到密钥池/日志复核。');
        return;
      }
      if (actionId === 'trend-focus') {
        focusControlInTab('overview', 'timeRange');
        showToast('已聚焦观测窗口。可切换 1 小时/24 小时/7 天对比趋势。');
      }
    } finally {
      restore();
    }
  }

  return { focusAlertTarget, runOverviewAction };
}
