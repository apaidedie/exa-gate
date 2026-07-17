import { el, esc, fmt, pct, setInsightCard, stamp, state } from '../state.js';
import { renderRetention } from './render-config.js';

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bucketTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
}

export function summarizeTrends(trends) {
  return trends.reduce((summary, bucket) => {
    const requests = num(bucket.requests);
    const failures = num(bucket.failures);
    const rateLimits = num(bucket.rateLimits);
    summary.requests += requests;
    summary.failures += failures;
    summary.rateLimits += rateLimits;
    if (!summary.peak || requests > num(summary.peak.requests)) summary.peak = bucket;
    return summary;
  }, { requests: 0, failures: 0, rateLimits: 0, peak: null });
}

/** Window traffic from observability trends (preferred for overview narrative). */
export function windowTrafficStats() {
  const trends = state.observability?.trends || [];
  if (!trends.length) return null;
  const summary = summarizeTrends(trends);
  return {
    requests: summary.requests,
    failures: summary.failures,
    rateLimits: summary.rateLimits,
    peak: summary.peak,
    buckets: trends.length
  };
}

function setTrendRecapAria(valueId, label, valueText, noteText, actionHint) {
  const valueEl = el(valueId);
  const button = valueEl?.closest('button.trend-recap-item');
  if (!button) return;
  const value = String(valueText || '').trim() || '-';
  const note = String(noteText || '').trim();
  button.setAttribute(
    'aria-label',
    label + '：' + value + (note ? '，' + note : '') + '。' + actionHint
  );
}

function renderTrendRecap(trends) {
  const summary = summarizeTrends(trends);
  const peakRequests = num(summary.peak?.requests);
  const requestsText = fmt(summary.requests);
  const requestsNote = trends.length ? fmt(trends.length) + ' 个趋势桶' : '暂无趋势样本';
  const failuresText = fmt(summary.failures);
  const failureRateText = pct(summary.failures, summary.requests);
  const rateLimitsText = fmt(summary.rateLimits);
  const rateLimitRateText = pct(summary.rateLimits, summary.requests);
  const peakText = peakRequests ? fmt(peakRequests) + ' 请求' : '无请求';
  const peakTimeText = peakRequests ? bucketTime(summary.peak?.bucketStart) : '待流量';
  el('trendRequests').textContent = requestsText;
  el('trendRequestsNote').textContent = requestsNote;
  el('trendFailures').className = summary.failures ? 'bad' : 'good';
  el('trendFailures').textContent = failuresText;
  el('trendFailureRate').textContent = failureRateText;
  el('trendRateLimits').className = summary.rateLimits ? 'warn' : 'good';
  el('trendRateLimits').textContent = rateLimitsText;
  el('trendRateLimitRate').textContent = rateLimitRateText;
  el('trendPeak').textContent = peakText;
  el('trendPeakTime').textContent = peakTimeText;
  setTrendRecapAria('trendRequests', '窗口请求', requestsText, requestsNote, '点击调整趋势观测窗口对比时段');
  setTrendRecapAria('trendFailures', '失败', failuresText, failureRateText, '点击筛选趋势失败日志并查看链路');
  setTrendRecapAria('trendRateLimits', '429 压力', rateLimitsText, rateLimitRateText, '点击筛选趋势 429 日志并收窄路径');
  setTrendRecapAria('trendPeak', '峰值桶', peakText, peakTimeText, '点击调整趋势峰值观测窗口');
}

function trendEmptyMarkup() {
  return '<div class="trend-empty">'
    + '<span class="empty-kicker" aria-hidden="true">待样本</span>'
    + '<strong>当前窗口暂无趋势数据</strong>'
    + '<p>产生代理请求后，这里会按时间桶显示请求、失败和 429 压力。可先切换 1 小时 / 7 天观测窗口，或打开请求日志确认是否已有流量。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-overview-signal-action="trend-focus" aria-label="调整趋势观测窗口。点击对比 1 小时/24 小时/7 天，待样本时可切换窗口等待流量">调整观测窗口</button>'
    + '<button class="ghost-btn" type="button" data-overview-signal-action="logs-focus" aria-label="查看请求日志确认流量。点击打开日志面板，待样本时可核对是否已有请求">查看请求日志</button>'
    + '<span>切换窗口或核对日志</span>'
    + '</div>'
    + '</div>';
}

function alertTone(alert) {
  const severity = alert?.severity || 'warn';
  if (severity === 'bad' || severity === 'good' || severity === 'blue') return severity;
  if (severity === 'info') return 'blue';
  return 'warn';
}

function alertLabel(alert) {
  const tone = alertTone(alert);
  if (tone === 'bad') return '严重';
  if (tone === 'blue') return '信息';
  if (tone === 'good') return '稳定';
  return '关注';
}

function alertAction(alert) {
  const tone = alertTone(alert);
  if (tone === 'bad') return '建议立即处理';
  if (tone === 'blue') return '记录状态';
  if (tone === 'good') return '无需处理';
  return '建议排查';
}

function renderAlert(alert) {
  const tone = alertTone(alert);
  const title = alert.title || '运行告警';
  const message = alert.message || '系统检测到需要关注的运行信号。';
  const code = alert.id || 'system';
  const actionLabel = alertAction(alert);
  const severity = alertLabel(alert);
  const next = tone === 'bad'
    ? '点击聚焦建议，并优先到密钥池或请求日志复核'
    : tone === 'warn'
      ? '点击聚焦建议，可到密钥池或日志继续排查'
      : '点击聚焦建议，可继续观察运行证据';
  return '<button class="alert-item overview-signal ' + esc(tone) + '" type="button" data-overview-signal-action="alert-focus" aria-label="告警：' + esc(title) + '，级别 ' + esc(severity) + '，' + esc(actionLabel) + '。' + next + '"><span class="alert-title"><span class="alert-title-main">' + esc(title) + '</span><span class="badge ' + esc(tone) + '" aria-hidden="true">' + esc(severity) + '</span></span><span class="alert-message">' + esc(message) + '</span><span class="alert-action"><span>' + esc(actionLabel) + '</span><strong>' + esc(code) + '</strong></span></button>';
}

function alertEmptyMarkup() {
  const traffic = windowTrafficStats();
  const failRate = traffic && traffic.requests > 0 ? traffic.failures / traffic.requests : 0;
  if (failRate >= 0.2) {
    return '<div class="alert-empty is-pressure">'
      + '<span class="empty-kicker" aria-hidden="true">无规则告警</span>'
      + '<strong>窗口失败偏高，建议复核日志</strong>'
      + '<p>当前没有触发规则告警，但观测窗口失败率 ' + pct(traffic.failures, traffic.requests)
      + '。可能是未授权探测或上游失败，请先打开请求日志确认。</p>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-overview-signal-action="log-errors" aria-label="点击筛选异常请求日志。窗口失败偏高时优先复核链路">筛选失败日志</button>'
      + '<button class="ghost-btn" type="button" data-overview-signal-action="keys" aria-label="点击打开密钥池复核调度状态">查看密钥池</button>'
      + '<span>无规则告警不等于无流量异常</span>'
      + '</div>'
      + '</div>';
  }
  return '<div class="alert-empty">'
    + '<span class="empty-kicker" aria-hidden="true">无告警</span>'
    + '<strong>当前窗口无需人工处理</strong>'
    + '<p>系统会继续观察可用密钥、失败率和 429 突增。可随时打开密钥池或请求日志复核运行证据。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-overview-signal-action="keys" aria-label="点击打开密钥池复核调度状态。无告警时可继续观察或管理密钥">查看密钥池</button>'
    + '<button class="ghost-btn" type="button" data-overview-signal-action="logs-focus" aria-label="点击打开请求日志复核流量。无告警时可继续观察请求证据">查看请求日志</button>'
    + '<span>保持观察，异常时会在此提示</span>'
    + '</div>'
    + '</div>';
}

export function renderObservability() {
  const data = state.observability || { trends: [], alerts: [], window: { label: '近 24 小时' } };
  const trends = data.trends || [];
  const alerts = data.alerts || [];
  const windowLabel = data.window?.label || '近 24 小时';
  const windowTone = alerts.some((item) => item.severity === 'bad') ? 'bad' : alerts.length ? 'warn' : 'blue';
  const maxRequests = Math.max(1, ...trends.map((bucket) => Number(bucket.requests || 0)));
  const trendBars = el('trendBars');
  const trendWindowEl = el('trendWindowLabel');
  if (trendWindowEl) {
    const windowNext = trends.length
      ? '可切换 1 小时/24 小时/7 天对比'
      : '可切换观测窗口或查看请求日志确认流量';
    trendWindowEl.textContent = windowLabel;
    trendWindowEl.setAttribute('role', 'status');
    trendWindowEl.setAttribute('aria-live', 'polite');
    trendWindowEl.setAttribute('aria-atomic', 'true');
    trendWindowEl.setAttribute('aria-label', '趋势窗口：' + windowLabel + '。' + windowNext);
  }
  setInsightCard('insightWindow', windowTone, windowLabel, trends.length ? '已汇总 ' + fmt(trends.length) + ' 个趋势桶，当前告警 ' + fmt(alerts.length) + ' 条。' : '当前窗口暂无趋势样本，产生请求后会自动形成趋势。');
  const trendSummaryEl = el('trendSummary');
  if (trendSummaryEl) {
    const hasBad = alerts.some((item) => item.severity === 'bad');
    const hasAlerts = alerts.length > 0;
    const traffic = summarizeTrends(trends);
    const failRate = traffic.requests > 0 ? traffic.failures / traffic.requests : 0;
    const highFail = failRate >= 0.2;
    const criticalFail = failRate >= 0.5;
    const trendText = hasBad || criticalFail
      ? '需关注'
      : hasAlerts || highFail
        ? (highFail && !hasAlerts ? '失败偏高' : '需关注')
        : (trends.length ? '稳定' : '待同步');
    const trendTone = hasBad || criticalFail ? 'bad' : (hasAlerts || highFail ? 'warn' : 'good');
    const trendNext = hasBad || criticalFail
      ? '请优先处理失败趋势并复核日志'
      : hasAlerts || highFail
        ? '可点告警项或失败摘要继续排查'
        : trends.length
          ? '可继续观察趋势摘要'
          : '可切换观测窗口或等待请求样本';
    trendSummaryEl.className = 'badge ' + trendTone;
    trendSummaryEl.textContent = trendText;
    trendSummaryEl.setAttribute('role', 'status');
    trendSummaryEl.setAttribute('aria-live', 'polite');
    trendSummaryEl.setAttribute('aria-atomic', 'true');
    trendSummaryEl.setAttribute(
      'aria-label',
      '趋势状态：' + trendText + (hasAlerts ? '，当前告警 ' + fmt(alerts.length) + ' 条' : '') + '。' + trendNext
    );
  }
  renderTrendRecap(trends);
  const trafficForBars = summarizeTrends(trends);
  const failRateBars = trafficForBars.requests > 0 ? trafficForBars.failures / trafficForBars.requests : 0;
  trendBars.className = 'trend-bars'
    + (trends.length ? '' : ' is-empty')
    + (failRateBars >= 0.5 ? ' is-critical-fail' : failRateBars >= 0.2 ? ' is-elevated-fail' : '');
  trendBars.setAttribute('role', 'img');
  const trendBarsNext = trends.length
    ? '可切换观测窗口对比，或点击上方摘要筛选日志'
    : '可切换观测窗口或查看请求日志确认流量';
  const trendBarsLabel = trends.length
    ? ('趋势柱图：' + windowLabel + '，' + fmt(trends.length) + ' 个时间桶。' + trendBarsNext)
    : ('趋势柱图：待样本。' + trendBarsNext);
  trendBars.setAttribute('aria-label', trendBarsLabel);
  trendBars.innerHTML = trends.map((bucket, i) => {
    const title = new Date(bucket.bucketStart).toLocaleString('zh-CN', { hour12: false }) + ' 请求 ' + fmt(bucket.requests) + '，失败 ' + fmt(bucket.failures) + '，429 ' + fmt(bucket.rateLimits) + '。可切换窗口对比或筛选日志';
    return '<div class="trend-bar" title="' + esc(title) + '" data-i="' + i + '"><span class="fail"></span><span class="rate"></span></div>';
  }).join('') || trendEmptyMarkup();
  // Apply dynamic heights via CSS custom properties (CSP-safe, no inline style attrs)
  trendBars.querySelectorAll('.trend-bar').forEach((bar) => {
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
  const alertCountText = fmt(alerts.length) + ' 条告警';
  const alertNext = alerts.length
    ? (alerts.some((item) => item.severity === 'bad') ? '请优先处理严重告警' : '可点告警项查看建议')
    : '可继续观察密钥池与请求日志';
  const alertCountEl = el('alertCount');
  if (alertCountEl) {
    alertCountEl.textContent = alertCountText;
    alertCountEl.setAttribute('role', 'status');
    alertCountEl.setAttribute('aria-live', 'polite');
    alertCountEl.setAttribute('aria-atomic', 'true');
    alertCountEl.setAttribute('aria-label', '告警中心：' + alertCountText + '。' + alertNext);
  }
  el('alertList').innerHTML = alerts.length ? alerts.map(renderAlert).join('') : alertEmptyMarkup();
  if (state.alertFocusUntil && Date.now() <= Number(state.alertFocusUntil) && state.activeTab === 'overview') {
    const applyAlertFocus = () => {
      if (Date.now() > Number(state.alertFocusUntil || 0) || state.activeTab !== 'overview') return;
      const alertTarget = document.querySelector('#alertList button[data-overview-signal-action="alert-focus"]');
      if (alertTarget && typeof alertTarget.focus === 'function') alertTarget.focus({ preventScroll: true });
    };
    // Double rAF covers alert list rebuild paint; short retry covers a follow-up refresh paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyAlertFocus();
        if (state.alertFocusUntil && Date.now() <= Number(state.alertFocusUntil || 0)) {
          setTimeout(applyAlertFocus, 48);
        }
      });
    });
  }
  renderRetention(data);
}
