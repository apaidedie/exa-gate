import { el, state } from '../state.js';
import { scheduleElementFocus } from '../ui/focus.js';

export function createTabs({
  updateSummary,
  renderObservability,
  renderKeys,
  renderDetails,
  renderLogs,
  renderLogTrace,
  renderAudit,
  renderConfigSummary,
  syncTableScrollAffordances
}) {
  function renderActiveTab(tabId) {
    if (tabId === 'overview') {
      updateSummary();
      renderObservability();
    } else if (tabId === 'keys') {
      renderKeys();
      renderDetails();
    } else if (tabId === 'logs') {
      renderLogs();
      renderLogTrace();
    } else if (tabId === 'audit') {
      renderAudit();
      renderConfigSummary();
    }
    requestAnimationFrame(syncTableScrollAffordances);
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    const tabMeta = {
      overview: { label: '概览', next: '可查看运行态势、趋势与告警' },
      keys: { label: '密钥池', next: '可管理密钥、筛选并批量操作' },
      logs: { label: '请求日志', next: '可筛选请求并查看链路' },
      audit: { label: '审计与配置', next: '可复核审计证据与上线配置' }
    };
    document.querySelectorAll('[data-tab-nav] .nav-item[data-tab]').forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      const meta = tabMeta[btn.dataset.tab] || { label: btn.dataset.tab || '页面', next: '可继续浏览控制台' };
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.setAttribute(
        'aria-label',
        isActive
          ? ('当前页面：' + meta.label + '。' + meta.next)
          : ('切换到' + meta.label + '。' + meta.next)
      );
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.tabPanel === tabId));
    const shell = document.querySelector('[data-console-shell]');
    if (shell) shell.classList.toggle('has-aside', tabId === 'keys');
    renderActiveTab(tabId);
  }

  function focusActiveTabControl(tabId) {
    scheduleElementFocus(() => {
      const controls = Array.from(document.querySelectorAll('[data-tab-nav] .nav-item[data-tab="' + tabId + '"]'));
      return controls.find((control) => control.offsetParent !== null) || null;
    });
  }

  function switchToCommandTab(tabId) {
    switchTab(tabId);
    focusActiveTabControl(tabId);
  }

  function focusControlInTab(tabId, controlId) {
    switchTab(tabId);
    const apply = () => {
      const control = el(controlId);
      if (control && typeof control.focus === 'function') control.focus();
    };
    // Double rAF covers tab panel paint; short retry covers delayed control mount.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        apply();
        setTimeout(apply, 48);
      });
    });
  }

  return { switchTab, renderActiveTab, focusActiveTabControl, switchToCommandTab, focusControlInTab };
}
