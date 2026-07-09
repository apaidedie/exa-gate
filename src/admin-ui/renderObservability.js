import { el, esc, fmt, setInsightCard, stamp, state } from './state.js';

export function renderRetention(data) {
  const retention = data.retention || {};
  const days = Number(retention.days || 0);
  const retained = Number(retention.retainedLogs || 0);
  const expired = Number(retention.expiredLogs || 0);
  const total = Number(retention.totalLogs || 0);
  el('retentionDays').textContent = days > 0 ? days + ' 天' : '关闭自动清理';
  el('retentionExpired').textContent = fmt(expired) + ' 条';
  el('retentionSummary').textContent = '当前存储 ' + fmt(total) + ' 条，保留窗口内 ' + fmt(retained) + ' 条。';
  el('retentionWindow').textContent = retention.cutoffMs ? '清理早于 ' + stamp(retention.cutoffMs) + ' 的请求日志。' : '自动清理未启用。';
}

export function renderConfigSummary() {
  const config = state.config || {};
  const strategyMap = { round_robin: '轮询', weighted_round_robin: '加权轮询', least_recently_used: '最少最近使用', adaptive_weighted: '自适应加权' };
  const listenEl = el('configListen'); if (listenEl) listenEl.textContent = config.listen || '-';
  const upstreamEl = el('configUpstream'); if (upstreamEl) upstreamEl.textContent = config.upstream || '-';
  const strategyEl = el('configStrategy'); if (strategyEl) strategyEl.textContent = strategyMap[config.selectionStrategy] || config.selectionStrategy || '-';
  const pathsEl = el('configAllowedPaths');
  if (pathsEl) {
    const allowed = config.allowedPaths || {};
    pathsEl.textContent = allowed.count ? '允许 ' + fmt(allowed.count) + ' 条路径：' + (allowed.preview || []).join('、') : '路径策略未载入';
  }
  const stateEl = el('configState'); if (stateEl) stateEl.textContent = config.state?.backend === 'sqlite' ? 'SQLite 持久化' : (config.state?.backend || '-');
  const affinityEl = el('configAffinity'); if (affinityEl) affinityEl.textContent = config.resourceAffinity ? '已启用资源亲和，后续资源请求优先使用创建密钥。' : '未启用资源亲和。';
  const rawKeyEl = el('configRawKey'); if (rawKeyEl) rawKeyEl.textContent = config.rawKeyDisplayAllowed ? '允许按审计复制原始密钥' : '默认脱敏展示';
  const httpsEl = el('configAdminHttps'); if (httpsEl) httpsEl.textContent = config.adminRequireHttps ? '要求 HTTPS 管理访问' : '未强制 HTTPS';
  const ttlEl = el('configSessionTtl'); if (ttlEl) ttlEl.textContent = config.adminSessionTtlSeconds ? '会话有效期 ' + fmt(Math.round(config.adminSessionTtlSeconds / 3600)) + ' 小时。' : '会话策略未载入';
}

export function renderObservability() {
  const data = state.observability || { trends: [], alerts: [], window: { label: '近 24 小时' } };
  const trends = data.trends || [];
  const alerts = data.alerts || [];
  const windowLabel = data.window?.label || '近 24 小时';
  const windowTone = alerts.some((item) => item.severity === 'bad') ? 'bad' : alerts.length ? 'warn' : 'blue';
  const maxRequests = Math.max(1, ...trends.map((bucket) => Number(bucket.requests || 0)));
  el('trendWindowLabel').textContent = windowLabel;
  setInsightCard('insightWindow', windowTone, windowLabel, trends.length ? '已汇总 ' + fmt(trends.length) + ' 个趋势桶，当前告警 ' + fmt(alerts.length) + ' 条。' : '当前窗口暂无趋势样本，产生请求后会自动形成趋势。');
  el('trendSummary').className = 'badge ' + (alerts.some((item) => item.severity === 'bad') ? 'bad' : alerts.length ? 'warn' : 'good');
  el('trendSummary').textContent = alerts.length ? '需关注' : '稳定';
  el('trendBars').innerHTML = trends.map((bucket, i) => {
    const title = new Date(bucket.bucketStart).toLocaleString('zh-CN', { hour12: false }) + ' 请求 ' + fmt(bucket.requests) + '，失败 ' + fmt(bucket.failures) + '，429 ' + fmt(bucket.rateLimits);
    return '<div class="trend-bar" title="' + esc(title) + '" data-i="' + i + '"><span class="fail"></span><span class="rate"></span></div>';
  }).join('') || '<div class="empty">暂无趋势数据。</div>';
  // Apply dynamic heights via CSS custom properties (CSP-safe, no inline style attrs)
  el('trendBars').querySelectorAll('.trend-bar').forEach((bar) => {
    const i = Number(bar.dataset.i);
    const bucket = trends[i];
    if (!bucket) return;
    const height = Math.max(3, Math.round(Number(bucket.requests || 0) / maxRequests * 100));
    const failHeight = Number(bucket.requests || 0) ? Math.round(Number(bucket.failures || 0) / Number(bucket.requests || 1) * 100) : 0;
    const rateHeight = Number(bucket.requests || 0) ? Math.round(Number(bucket.rateLimits || 0) / Number(bucket.requests || 1) * 100) : 0;
    bar.style.setProperty('--h', height);
    bar.querySelector('.fail').style.setProperty('--h', failHeight);
    bar.querySelector('.rate').style.setProperty('--h', rateHeight);
  });
  el('alertCount').textContent = fmt(alerts.length) + ' 条告警';
  el('alertList').innerHTML = alerts.length ? alerts.map((alert) => '<div class="alert-item ' + esc(alert.severity || 'warn') + '"><div class="alert-title"><span>' + esc(alert.title) + '</span><span class="badge ' + esc(alert.severity || 'warn') + '">' + (alert.severity === 'bad' ? '严重' : '关注') + '</span></div><div class="alert-message">' + esc(alert.message) + '</div></div>').join('') : '<div class="empty">暂无告警。</div>';
  renderRetention(data);
}
