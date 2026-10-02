import { api, exportLogs } from '../api.js';
import { el, fmt, state } from '../state.js';
import { showToast } from '../ui/toast.js';
import { setButtonPending } from '../ui/busy.js';
import { openConfirmAction } from '../ui/confirm-action.js';

export function createConsoleOps(deps) {
  const refresh = (options) => deps.refresh(options);
  const switchTab = (tab) => deps.switchTab(tab);
  async function pruneLogs() {
    const days = Number(state.observability?.retention?.days || 14);
    const button = el('pruneLogs');
    const restore = setButtonPending(button, '正在清理');
    try {
      const result = await api('/_proxy/logs/prune', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ days }) });
      showToast('已清理 ' + fmt(result.deleted || 0) + ' 条过期日志。操作已写入审计日志，可继续观察请求日志。');
      await refresh({ force: true });
    } finally {
      restore();
    }
  }

  function requestPruneLogsConfirm() {
    const days = Number(state.observability?.retention?.days || 14);
    openConfirmAction({
      id: 'prune-logs',
      title: '清理过期日志',
      body: '将删除超过 ' + days + ' 天保留期的过期请求日志。仅清理过期记录，此操作会写入管理员审计。',
      acceptLabel: '确认清理',
      pendingLabel: '正在清理',
      run: () => pruneLogs()
    });
  }

  async function testWebhook() {
    const button = el('testWebhook');
    const restore = setButtonPending(button, '正在测试');
    try {
      const result = await api('/_proxy/alerts/webhook/test', { method: 'POST' });
      const ok = Boolean(result.ok);
      showToast(ok ? 'Webhook 测试已发送。投递记录已写入审计日志，可继续观察告警中心。' : 'Webhook 测试失败：' + (result.error || result.statusCode || '未知错误') + '。请检查 Webhook URL 与密钥配置后重试。', ok ? 'good' : 'bad');
      await refresh({ force: true });
    } catch (error) {
      showToast('Webhook 测试失败：' + (error.message || '未知错误') + '。请检查 Webhook URL 与网络后重试。', 'bad');
    } finally {
      restore();
    }
  }

  async function runExportLogs() {
    const button = el('exportLogs');
    const restore = setButtonPending(button, '正在导出');
    try {
      await exportLogs();
      showToast('请求日志已导出。可在下载目录打开 CSV，或调整筛选后再次导出。');
    } catch (error) {
      showToast('请求日志导出失败：' + (error.message || '未知错误') + '。请检查筛选条件或网络后重试。', 'bad');
    } finally {
      restore();
    }
  }

  function syncAutoRefreshAria() {
    const auto = el('autoRefresh');
    if (!auto) return;
    auto.setAttribute(
      'aria-label',
      auto.checked
        ? '自动刷新：已开启。可取消以仅手动刷新控制台数据'
        : '自动刷新：已关闭。可勾选以按间隔自动刷新控制台数据'
    );
  }

  function syncSidebarCollapseControl(collapsed) {
    const collapseBtn = el('sidebarCollapse');
    if (!collapseBtn) return;
    const collapseIcon = collapseBtn.querySelector('.nav-icon');
    const collapseLabel = collapseBtn.querySelector('.nav-label');
    const isCollapsed = Boolean(collapsed);
    if (collapseIcon) collapseIcon.classList.toggle('is-collapsed', isCollapsed);
    if (collapseLabel) collapseLabel.textContent = isCollapsed ? '展开' : '收起';
    collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
    collapseBtn.setAttribute('aria-pressed', String(isCollapsed));
    collapseBtn.setAttribute(
      'aria-label',
      isCollapsed
        ? '侧栏导航：已收起。点击展开完整导航标签，可按页面名称切换'
        : '侧栏导航：已展开。点击收起为图标导航，可腾出主工作区宽度'
    );
    collapseBtn.title = isCollapsed ? '展开侧栏' : '收起侧栏';
  }

  function bindSidebarCollapse() {
    const collapseBtn = el('sidebarCollapse');
    const shellEl = document.querySelector('[data-console-shell]');
    if (!collapseBtn || !shellEl) return;
    const startCollapsed = localStorage.getItem('exaSidebarCollapsed') === '1';
    if (startCollapsed) shellEl.setAttribute('data-sidebar-collapsed', '');
    else shellEl.removeAttribute('data-sidebar-collapsed');
    syncSidebarCollapseControl(startCollapsed);
    collapseBtn.addEventListener('click', () => {
      const collapsed = shellEl.hasAttribute('data-sidebar-collapsed');
      if (collapsed) {
        shellEl.removeAttribute('data-sidebar-collapsed');
        localStorage.setItem('exaSidebarCollapsed', '0');
        syncSidebarCollapseControl(false);
      } else {
        shellEl.setAttribute('data-sidebar-collapsed', '');
        localStorage.setItem('exaSidebarCollapsed', '1');
        syncSidebarCollapseControl(true);
      }
    });
  }

  return {
    requestPruneLogsConfirm,
    testWebhook,
    runExportLogs,
    syncAutoRefreshAria,
    syncSidebarCollapseControl,
    bindSidebarCollapse
  };
}
