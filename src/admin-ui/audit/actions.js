import { api, exportAudit } from '../api.js';
import { el, state } from '../state.js';
import { renderAudit } from '../renderLogs.js';
import { showToast } from '../ui/toast.js';
import { setButtonBusy, setButtonPending } from '../ui/busy.js';
import { scheduleControlFocus } from '../ui/focus.js';

export async function reloadAudit(options = {}) {
  const restore = options.button ? setButtonPending(options.button, options.pendingText || '正在刷新') : () => {};
  try {
    const auditData = await api('/_proxy/audit?limit=12');
    state.audit = auditData.audit || [];
    renderAudit();
  } finally {
    restore();
  }
}

export function clearAuditFilters() {
  el('auditSearch').value = '';
  el('auditActionFilter').value = '';
  el('auditOutcomeFilter').value = '';
  renderAudit();
  showToast('审计筛选已清除。可继续搜索关键词，或按动作/结果收窄。');
}

export function removeAuditFilterDimension(dimension) {
  const labels = { query: '关键词', action: '动作', outcome: '结果' };
  if (dimension === 'query') el('auditSearch').value = '';
  else if (dimension === 'action') el('auditActionFilter').value = '';
  else if (dimension === 'outcome') el('auditOutcomeFilter').value = '';
  else return;
  renderAudit();
  showToast('已移除' + (labels[dimension] || '') + '筛选。可继续调整其他条件或导出证据。');
}

export function focusAuditSearch({ select = false } = {}) {
  scheduleControlFocus('auditSearch', { select });
}

export function focusAuditOutcomeFilter() {
  scheduleControlFocus('auditOutcomeFilter');
}

export async function runAuditEvidenceAction(button) {
  const action = button?.dataset?.auditEvidenceAction || '';
  if (!action || button.disabled) return;
  const restore = setButtonBusy(button, action === 'export' ? '正在导出审计' : action === 'reset' ? '正在重置筛选' : '正在筛选审计');
  try {
    if (action === 'reset') {
      const wasFiltered = Boolean(el('auditSearch').value.trim()) || Boolean(el('auditActionFilter').value) || Boolean(el('auditOutcomeFilter').value);
      clearAuditFilters();
      focusAuditSearch({ select: true });
      if (!wasFiltered) showToast('已聚焦审计搜索。可输入动作/密钥 ID，或按结果筛选失败项。');
      return;
    }
    if (action === 'failures') {
      el('auditOutcomeFilter').value = 'failure';
      renderAudit();
      focusAuditOutcomeFilter();
      showToast('已筛选失败审计记录。可点条目复核，或清除筛选恢复全部。');
      return;
    }
    if (action === 'latest') {
      const value = button.dataset.auditEvidenceValue || '';
      if (!value) {
        showToast('暂无最新审计线索。请完成一次管理操作或刷新审计列表后再试。', 'warn');
        return;
      }
      el('auditSearch').value = value;
      renderAudit();
      focusAuditSearch({ select: true });
      showToast('已按最新审计线索搜索。可继续按动作/结果收窄，或清除筛选。');
      return;
    }
    if (action === 'export') {
      await exportAudit();
      showToast('审计证据导出已开始。可在下载目录打开 CSV，或继续筛选审计证据。');
    }
  } finally {
    restore();
    renderAudit();
  }
}
