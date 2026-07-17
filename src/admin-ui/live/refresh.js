import { el, stamp } from '../state.js';

const refreshStatusCopy = {
  waiting: '待同步',
  syncing: '正在同步',
  updated: '已刷新 ',
  failed: '同步失败'
};
const refreshStatusAria = {
  waiting: '控制台同步：待首次同步。可点击刷新状态开始同步',
  syncing: '控制台同步：正在同步密钥与观测数据。请稍候',
  updated: '控制台同步：已刷新',
  failed: '控制台同步：同步失败。可点击立即重试或检查网络后继续'
};
const liveLinkCopy = {
  live: '实时在线',
  reconnecting: '正在重连',
  offline: '实时离线'
};
const liveLinkAria = {
  live: '实时链路：已连接，变更会自动推送。可继续观察控制台',
  reconnecting: '实时链路：连接中断，正在重连。可稍候或手动刷新控制台',
  offline: '实时链路：已断开。可点击刷新状态重新同步'
};

function refreshTimeLabel(value = Date.now()) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function setRefreshRecovery(visible, detail = '') {
  const banner = el('refreshRecovery');
  if (!banner) return;
  banner.hidden = !visible;
  const recoveryText = detail
    ? ('最近同步失败：' + detail + '。可点击立即重试，或检查服务与网络后继续。')
    : '最近同步失败。可点击立即重试，或检查服务与网络后继续。';
  const text = el('refreshRecoveryText');
  if (text) {
    text.textContent = recoveryText;
    text.setAttribute('role', 'status');
    text.setAttribute('aria-live', 'assertive');
    text.setAttribute('aria-atomic', 'true');
    text.setAttribute('aria-label', '同步异常说明：' + recoveryText);
  }
  const title = el('refreshRecoveryTitle');
  if (title) {
    title.setAttribute('role', 'status');
    title.setAttribute('aria-live', 'assertive');
    title.setAttribute('aria-atomic', 'true');
    title.setAttribute('aria-label', '控制台刷新失败。可立即重试');
  }
  if (visible) {
    banner.setAttribute('aria-label', '控制台刷新失败恢复区。' + recoveryText);
  } else {
    banner.setAttribute('aria-label', '控制台刷新失败恢复区。同步正常时隐藏；失败时可立即重试');
  }
  const retry = el('retryRefresh');
  if (retry) {
    retry.setAttribute('aria-label', '立即重试控制台刷新。重新同步密钥与观测数据后可继续运维');
  }
  const status = el('lastUpdated');
  if (status) {
    if (visible) status.setAttribute('aria-describedby', 'refreshRecoveryText');
    else status.removeAttribute('aria-describedby');
  }
}

function setConsoleLoading(active) {
  const shell = document.querySelector('[data-console-shell]');
  if (!(shell instanceof HTMLElement)) return;
  if (active) shell.setAttribute('data-console-loading', 'true');
  else shell.removeAttribute('data-console-loading');
}

/**
 * @param {'waiting'|'syncing'|'updated'|'failed'} status
 * @param {string} [detail]
 * @param {{ blockUi?: boolean, quiet?: boolean }} [options]
 *   blockUi — skeleton/grey overlay (first paint only by default)
 *   quiet — keep last "已刷新" text; no blocking overlay (auto/SSE refresh)
 */
export function setRefreshStatus(status, detail = '', options = {}) {
  const target = el('lastUpdated');
  if (!target) return;
  const safeStatus = Object.prototype.hasOwnProperty.call(refreshStatusCopy, status) ? status : 'waiting';
  const quiet = Boolean(options.quiet);
  const blockUi = options.blockUi === true || (safeStatus === 'waiting' && !quiet);

  target.setAttribute('data-refresh-state', safeStatus);
  target.classList.toggle('is-quiet', quiet && safeStatus === 'syncing');

  if (blockUi && (safeStatus === 'syncing' || safeStatus === 'waiting')) {
    setConsoleLoading(true);
  } else if (safeStatus === 'updated' || safeStatus === 'failed' || safeStatus === 'syncing') {
    // Silent/background syncing must never leave the skeleton overlay active.
    setConsoleLoading(false);
  }

  target.setAttribute('role', 'status');
  target.className = 'refresh-status is-' + safeStatus + (quiet && safeStatus === 'syncing' ? ' is-quiet' : '');

  if (quiet && safeStatus === 'syncing') {
    // Keep the previous "已刷新 HH:mm" label so auto-refresh stays non-blocking.
    if (!target.textContent || target.textContent === refreshStatusCopy.waiting || target.textContent === refreshStatusCopy.syncing) {
      target.textContent = refreshStatusCopy.updated + refreshTimeLabel();
    }
    target.title = '后台同步中';
    target.setAttribute('aria-label', '控制台同步：后台静默刷新中。可继续操作，无需等待');
    target.setAttribute('aria-busy', 'true');
  } else if (safeStatus === 'updated') {
    const refreshedAt = Date.now();
    const timeLabel = detail || refreshTimeLabel(refreshedAt);
    target.textContent = refreshStatusCopy.updated + timeLabel;
    target.title = '已刷新 ' + stamp(refreshedAt);
    target.setAttribute('aria-label', refreshStatusAria.updated + ' ' + timeLabel + '。可继续观察，或再次点击刷新状态');
    target.removeAttribute('aria-busy');
  } else {
    const text = refreshStatusCopy[safeStatus] + (detail ? ' · ' + detail : '');
    target.textContent = text;
    target.title = text;
    target.setAttribute('aria-label', detail
      ? (refreshStatusAria[safeStatus] + ' · ' + detail + (safeStatus === 'failed' ? '' : '。可继续观察或手动刷新'))
      : (refreshStatusAria[safeStatus] || refreshStatusAria.waiting));
    if (safeStatus === 'syncing') target.setAttribute('aria-busy', 'true');
    else target.removeAttribute('aria-busy');
  }

  if (safeStatus === 'failed') setRefreshRecovery(true, detail);
  else if (safeStatus === 'updated' || safeStatus === 'syncing' || safeStatus === 'waiting') setRefreshRecovery(false);
  const dashMirror = el('dashUpdatedMirror');
  if (dashMirror) {
    dashMirror.textContent = target.textContent || '待同步';
  }
}

export function setLiveLinkStatus(status) {
  const target = el('liveLinkStatus');
  if (!target) return;
  const safeStatus = Object.prototype.hasOwnProperty.call(liveLinkCopy, status) ? status : 'offline';
  target.setAttribute('data-live-state', safeStatus);
  target.setAttribute('role', 'status');
  target.setAttribute('aria-label', liveLinkAria[safeStatus] || liveLinkAria.offline);
  target.className = 'live-link-status is-' + safeStatus;
  target.textContent = liveLinkCopy[safeStatus];
  target.title = liveLinkCopy[safeStatus];
}

export function updateLastUpdated() {
  setRefreshStatus('updated');
}
