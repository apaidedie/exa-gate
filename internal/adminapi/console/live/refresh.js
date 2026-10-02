import { el } from '../state.js';

const refreshStatusCopy = {
  waiting: '待同步',
  syncing: '正在同步',
  updated: '已刷新 ',
  failed: '同步失败'
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
  const safeStatus = Object.prototype.hasOwnProperty.call(refreshStatusCopy, status) ? status : 'waiting';
  const quiet = Boolean(options.quiet);
  const blockUi = options.blockUi === true || (safeStatus === 'waiting' && !quiet);

  if (blockUi && (safeStatus === 'syncing' || safeStatus === 'waiting')) {
    setConsoleLoading(true);
  } else if (safeStatus === 'updated' || safeStatus === 'failed' || safeStatus === 'syncing') {
    // Silent/background syncing must never leave the skeleton overlay active.
    setConsoleLoading(false);
  }

  const target = el('lastUpdated');
  if (target) {
    target.setAttribute('data-refresh-state', safeStatus);
    target.classList.toggle('is-quiet', quiet && safeStatus === 'syncing');
    target.setAttribute('role', 'status');
    target.className = 'refresh-status is-' + safeStatus + (quiet && safeStatus === 'syncing' ? ' is-quiet' : '');
    if (quiet && safeStatus === 'syncing') {
      // Keep the previous "已刷新 HH:mm" label so auto-refresh stays non-blocking.
      if (!target.textContent || target.textContent === refreshStatusCopy.waiting || target.textContent === refreshStatusCopy.syncing) {
        target.textContent = refreshStatusCopy.updated + refreshTimeLabel();
      }
    } else if (safeStatus === 'updated') {
      target.textContent = refreshStatusCopy.updated + (detail || refreshTimeLabel());
    } else {
      target.textContent = refreshStatusCopy[safeStatus] + (detail ? ' · ' + detail : '');
    }
  }

  if (safeStatus === 'failed') setRefreshRecovery(true, detail);
  else if (safeStatus === 'updated' || safeStatus === 'syncing' || safeStatus === 'waiting') setRefreshRecovery(false);
  const dashMirror = el('dashUpdatedMirror');
  if (dashMirror) {
    const chipText = target
      ? target.textContent
      : (safeStatus === 'updated' ? refreshStatusCopy.updated + refreshTimeLabel() : refreshStatusCopy[safeStatus]);
    dashMirror.textContent = chipText || '待同步';
  }
}

const RELEASES_URL = 'https://github.com/apaidedie/exa-gate/releases';

/** Version chip: current version + whether a newer release exists. */
export function renderVersionStatus(info) {
  const chip = el('versionStatus');
  if (chip) {
    const current = info?.current ? String(info.current) : '';
    const latest = info?.latest ? String(info.latest) : null;
    const upToDate = typeof info?.upToDate === 'boolean' ? info.upToDate : null;
    let tone = 'unknown';
    let label;
    if (!current) {
      chip.textContent = 'v—';
      label = '控制台版本：待同步。可点击查看项目 releases';
    } else if (upToDate === false && latest) {
      tone = 'warn';
      chip.textContent = 'v' + current + ' → v' + latest;
      label = '当前版本 v' + current + '，最新版本 v' + latest + '。可点击查看 release 更新';
    } else if (upToDate === true) {
      tone = 'good';
      chip.textContent = 'v' + current;
      label = '当前版本 v' + current + '，已是最新。可点击查看项目 releases';
    } else {
      chip.textContent = 'v' + current;
      label = '当前版本 v' + current + (info?.checkError ? '，最新版本检查暂不可用' : '，正在检查更新');
    }
    chip.className = 'version-chip is-' + tone;
    chip.title = label;
    chip.setAttribute('aria-label', label + '。可点击打开项目 releases 页面');
    chip.href = upToDate === false && latest ? RELEASES_URL + '/tag/v' + latest : RELEASES_URL;
  }
}

export function updateLastUpdated() {
  setRefreshStatus('updated');
}
