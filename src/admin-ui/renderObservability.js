import { el, esc, fmt, pct, setInsightCard, stamp, state } from './state.js';

function num(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bucketTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
}

function summarizeTrends(trends) {
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

function renderTrendRecap(trends) {
  const summary = summarizeTrends(trends);
  const peakRequests = num(summary.peak?.requests);
  el('trendRequests').textContent = fmt(summary.requests);
  el('trendRequestsNote').textContent = trends.length ? fmt(trends.length) + ' 个趋势桶' : '暂无趋势样本';
  el('trendFailures').className = summary.failures ? 'bad' : 'good';
  el('trendFailures').textContent = fmt(summary.failures);
  el('trendFailureRate').textContent = pct(summary.failures, summary.requests);
  el('trendRateLimits').className = summary.rateLimits ? 'warn' : 'good';
  el('trendRateLimits').textContent = fmt(summary.rateLimits);
  el('trendRateLimitRate').textContent = pct(summary.rateLimits, summary.requests);
  el('trendPeak').textContent = peakRequests ? fmt(peakRequests) + ' 请求' : '无请求';
  el('trendPeakTime').textContent = peakRequests ? bucketTime(summary.peak?.bucketStart) : '待流量';
}

function trendEmptyMarkup() {
  return '<div class="trend-empty">'
    + '<span class="empty-kicker">待样本</span>'
    + '<strong>当前窗口暂无趋势数据</strong>'
    + '<p>产生代理请求后，这里会按时间桶显示请求、失败和 429 压力。可先切换 1 小时 / 7 天观测窗口，或打开请求日志确认是否已有流量。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-overview-signal-action="trend-focus" aria-label="调整趋势观测窗口">调整观测窗口</button>'
    + '<button class="ghost-btn" type="button" data-overview-signal-action="logs-focus" aria-label="查看请求日志确认流量">查看请求日志</button>'
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
  return '<button class="alert-item overview-signal ' + esc(tone) + '" type="button" data-overview-signal-action="alert-focus" aria-label="聚焦告警建议：' + esc(title) + '"><span class="alert-title"><span class="alert-title-main">' + esc(title) + '</span><span class="badge ' + esc(tone) + '">' + alertLabel(alert) + '</span></span><span class="alert-message">' + esc(message) + '</span><span class="alert-action"><span>' + actionLabel + '</span><strong>' + esc(code) + '</strong></span></button>';
}

function alertEmptyMarkup() {
  return '<div class="alert-empty">'
    + '<span class="empty-kicker">无告警</span>'
    + '<strong>当前窗口无需人工处理</strong>'
    + '<p>系统会继续观察可用密钥、失败率和 429 突增。可随时打开密钥池或请求日志复核运行证据。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-overview-signal-action="keys" aria-label="打开密钥池复核调度状态">查看密钥池</button>'
    + '<button class="ghost-btn" type="button" data-overview-signal-action="logs-focus" aria-label="打开请求日志复核流量">查看请求日志</button>'
    + '<span>保持观察，异常时会在此提示</span>'
    + '</div>'
    + '</div>';
}

const evidenceStatusLabels = {
  configEvidenceHttps: 'HTTPS 管理',
  configEvidenceRawKey: '原始密钥',
  configEvidencePaths: '路径策略',
  configEvidenceState: '状态存储',
};

const readinessStatusLabels = {
  readinessHttps: 'HTTPS 管理',
  readinessRawKey: '原始密钥',
  readinessState: '状态持久化',
  readinessRetention: '日志保留',
};

function setEvidenceCell(id, tone, value, hint) {
  const valueEl = el(id);
  const hintEl = el(id + 'Hint');
  const label = evidenceStatusLabels[id] || '配置证据';
  const statusText = String(value || '');
  const framed = label + '：' + statusText;
  if (valueEl) {
    valueEl.className = tone || '';
    valueEl.textContent = statusText;
    valueEl.setAttribute('role', 'status');
    valueEl.setAttribute('aria-live', 'polite');
    valueEl.setAttribute('aria-atomic', 'true');
    valueEl.setAttribute('aria-label', framed);
    const button = valueEl.closest('button.config-evidence-item');
    if (button) {
      button.setAttribute('aria-label', framed + '。查看配置详情');
    }
  }
  if (hintEl) hintEl.textContent = hint;
}

function setReadinessCheck(id, tone, value, hint) {
  const card = el(id);
  const valueEl = el(id + 'Value');
  const hintEl = el(id + 'Hint');
  const label = readinessStatusLabels[id] || '上线检查';
  const statusText = String(value || '');
  const framed = label + '：' + statusText + (hint ? '。' + hint : '');
  if (card) card.className = 'readiness-check ' + (tone || '');
  if (valueEl) {
    valueEl.textContent = statusText;
    valueEl.setAttribute('role', 'status');
    valueEl.setAttribute('aria-live', 'polite');
    valueEl.setAttribute('aria-atomic', 'true');
    valueEl.setAttribute('aria-label', framed);
  }
  if (hintEl) hintEl.textContent = hint;
}

export function renderRetention(data) {
  const retention = data.retention || {};
  const days = Number(retention.days || 0);
  const retained = Number(retention.retainedLogs || 0);
  const expired = Number(retention.expiredLogs || 0);
  const total = Number(retention.totalLogs || 0);
  const daysText = days > 0 ? days + ' 天' : '关闭自动清理';
  const expiredText = fmt(expired) + ' 条';
  const summaryText = '当前存储 ' + fmt(total) + ' 条，保留窗口内 ' + fmt(retained) + ' 条。';
  const windowText = retention.cutoffMs ? '清理早于 ' + stamp(retention.cutoffMs) + ' 的请求日志。' : '自动清理未启用。';
  el('retentionDays').textContent = daysText;
  el('retentionExpired').textContent = expiredText;
  el('retentionSummary').textContent = summaryText;
  el('retentionWindow').textContent = windowText;
  const retentionWindowText = total ? fmt(retained) + ' / ' + fmt(total) + ' 条在窗口内' : windowText;
  const governanceRetentionEl = el('governanceRetention');
  if (governanceRetentionEl) {
    governanceRetentionEl.textContent = daysText;
    governanceRetentionEl.setAttribute('role', 'status');
    governanceRetentionEl.setAttribute('aria-live', 'polite');
    governanceRetentionEl.setAttribute('aria-atomic', 'true');
    governanceRetentionEl.setAttribute('aria-label', '日志保留：' + daysText);
  }
  const governanceExpiredEl = el('governanceExpired');
  if (governanceExpiredEl) {
    governanceExpiredEl.textContent = expiredText;
    governanceExpiredEl.setAttribute('role', 'status');
    governanceExpiredEl.setAttribute('aria-live', 'polite');
    governanceExpiredEl.setAttribute('aria-atomic', 'true');
    governanceExpiredEl.setAttribute('aria-label', '过期日志：' + expiredText);
  }
  const governanceRetentionWindowEl = el('governanceRetentionWindow');
  if (governanceRetentionWindowEl) {
    governanceRetentionWindowEl.textContent = retentionWindowText;
    governanceRetentionWindowEl.setAttribute('role', 'status');
    governanceRetentionWindowEl.setAttribute('aria-live', 'polite');
    governanceRetentionWindowEl.setAttribute('aria-atomic', 'true');
    governanceRetentionWindowEl.setAttribute('aria-label', '保留窗口：' + retentionWindowText);
  }
  setReadinessCheck('readinessRetention', days > 0 ? 'good' : 'warn', days > 0 ? '已设置 ' + daysText : '未启用自动清理', days > 0 ? '过期日志 ' + expiredText + '，保留窗口可用于排障' : '上线前建议设置 EXA_LOG_RETENTION_DAYS');
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
  const rawKeyText = config.rawKeyDisplayAllowed ? '允许按审计复制原始密钥' : '默认脱敏展示';
  const httpsText = config.adminRequireHttps ? '要求 HTTPS 管理访问' : '未强制 HTTPS';
  const ttlText = config.adminSessionTtlSeconds ? '会话有效期 ' + fmt(Math.round(config.adminSessionTtlSeconds / 3600)) + ' 小时。' : '会话策略未载入';
  const allowed = config.allowedPaths || {};
  const pathText = allowed.count ? '允许 ' + fmt(allowed.count) + ' 条路径' : '路径策略未载入';
  const stateText = config.state?.backend === 'sqlite' ? 'SQLite 持久化' : (config.state?.backend || '未载入');
  const rawKeyEl = el('configRawKey'); if (rawKeyEl) rawKeyEl.textContent = rawKeyText;
  const httpsEl = el('configAdminHttps'); if (httpsEl) httpsEl.textContent = httpsText;
  const ttlEl = el('configSessionTtl'); if (ttlEl) ttlEl.textContent = ttlText;
  setEvidenceCell('configEvidenceHttps', config.adminRequireHttps ? 'good' : 'warn', httpsText, config.adminRequireHttps ? '管理接口要求安全传输' : '本地或反代层需补足 HTTPS');
  setEvidenceCell('configEvidenceRawKey', config.rawKeyDisplayAllowed ? 'warn' : 'good', rawKeyText, config.rawKeyDisplayAllowed ? '复制会写入管理员审计' : '默认隐藏上游密钥原文');
  setEvidenceCell('configEvidencePaths', allowed.count ? 'good' : 'warn', pathText, allowed.count ? (allowed.preview || []).join('、') : '未收到允许路径摘要');
  setEvidenceCell('configEvidenceState', config.state?.backend === 'sqlite' ? 'good' : 'warn', stateText, config.resourceAffinity ? '资源亲和已启用' : '资源亲和未启用');
  setReadinessCheck('readinessHttps', config.adminRequireHttps ? 'good' : 'warn', config.adminRequireHttps ? '已强制 HTTPS' : '需确认 HTTPS', config.adminRequireHttps ? '管理入口拒绝非安全请求' : '本地调试可用，上线需由反代或配置补足');
  setReadinessCheck('readinessRawKey', config.rawKeyDisplayAllowed ? 'warn' : 'good', config.rawKeyDisplayAllowed ? '允许显示原文' : '默认脱敏', config.rawKeyDisplayAllowed ? '上线建议关闭，仅在审计下临时复制' : '上游密钥不会默认暴露在界面');
  setReadinessCheck('readinessState', config.state?.backend === 'sqlite' ? 'good' : 'warn', stateText, config.state?.backend === 'sqlite' ? '密钥状态与审计写入本地状态库' : '请确认容器重启后的状态保存策略');
  const governanceHttpsEl = el('governanceHttps');
  if (governanceHttpsEl) {
    governanceHttpsEl.textContent = httpsText;
    governanceHttpsEl.className = config.adminRequireHttps ? 'good' : 'warn';
    governanceHttpsEl.setAttribute('role', 'status');
    governanceHttpsEl.setAttribute('aria-live', 'polite');
    governanceHttpsEl.setAttribute('aria-atomic', 'true');
    governanceHttpsEl.setAttribute('aria-label', '安全 HTTPS：' + httpsText);
  }
  const governanceRawKeyEl = el('governanceRawKey');
  if (governanceRawKeyEl) {
    governanceRawKeyEl.textContent = rawKeyText;
    governanceRawKeyEl.className = config.rawKeyDisplayAllowed ? 'warn' : 'good';
    governanceRawKeyEl.setAttribute('role', 'status');
    governanceRawKeyEl.setAttribute('aria-live', 'polite');
    governanceRawKeyEl.setAttribute('aria-atomic', 'true');
    governanceRawKeyEl.setAttribute('aria-label', '原始密钥策略：' + rawKeyText);
  }
  const governanceSessionEl = el('governanceSession');
  if (governanceSessionEl) {
    governanceSessionEl.textContent = ttlText;
    governanceSessionEl.setAttribute('role', 'status');
    governanceSessionEl.setAttribute('aria-live', 'polite');
    governanceSessionEl.setAttribute('aria-atomic', 'true');
    governanceSessionEl.setAttribute('aria-label', '会话策略：' + ttlText);
  }
  const governancePathPolicyEl = el('governancePathPolicy');
  if (governancePathPolicyEl) {
    governancePathPolicyEl.textContent = pathText;
    governancePathPolicyEl.setAttribute('role', 'status');
    governancePathPolicyEl.setAttribute('aria-live', 'polite');
    governancePathPolicyEl.setAttribute('aria-atomic', 'true');
    governancePathPolicyEl.setAttribute('aria-label', '路径策略：' + pathText);
  }
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
    trendWindowEl.textContent = windowLabel;
    trendWindowEl.setAttribute('role', 'status');
    trendWindowEl.setAttribute('aria-live', 'polite');
    trendWindowEl.setAttribute('aria-atomic', 'true');
    trendWindowEl.setAttribute('aria-label', '趋势窗口：' + windowLabel);
  }
  setInsightCard('insightWindow', windowTone, windowLabel, trends.length ? '已汇总 ' + fmt(trends.length) + ' 个趋势桶，当前告警 ' + fmt(alerts.length) + ' 条。' : '当前窗口暂无趋势样本，产生请求后会自动形成趋势。');
  const trendSummaryEl = el('trendSummary');
  if (trendSummaryEl) {
    const hasBad = alerts.some((item) => item.severity === 'bad');
    const hasAlerts = alerts.length > 0;
    const trendText = hasAlerts ? '需关注' : (trends.length ? '稳定' : '待同步');
    const trendTone = hasBad ? 'bad' : hasAlerts ? 'warn' : 'good';
    trendSummaryEl.className = 'badge ' + trendTone;
    trendSummaryEl.textContent = trendText;
    trendSummaryEl.setAttribute('role', 'status');
    trendSummaryEl.setAttribute('aria-live', 'polite');
    trendSummaryEl.setAttribute('aria-atomic', 'true');
    trendSummaryEl.setAttribute('aria-label', '趋势状态：' + trendText + (hasAlerts ? '，当前告警 ' + fmt(alerts.length) + ' 条' : ''));
  }
  renderTrendRecap(trends);
  trendBars.className = 'trend-bars' + (trends.length ? '' : ' is-empty');
  trendBars.innerHTML = trends.map((bucket, i) => {
    const title = new Date(bucket.bucketStart).toLocaleString('zh-CN', { hour12: false }) + ' 请求 ' + fmt(bucket.requests) + '，失败 ' + fmt(bucket.failures) + '，429 ' + fmt(bucket.rateLimits);
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
  const alertCountEl = el('alertCount');
  if (alertCountEl) {
    alertCountEl.textContent = alertCountText;
    alertCountEl.setAttribute('role', 'status');
    alertCountEl.setAttribute('aria-live', 'polite');
    alertCountEl.setAttribute('aria-atomic', 'true');
    alertCountEl.setAttribute('aria-label', '告警中心：' + alertCountText);
  }
  el('alertList').innerHTML = alerts.length ? alerts.map(renderAlert).join('') : alertEmptyMarkup();
  if (state.alertFocusUntil && Date.now() <= Number(state.alertFocusUntil) && state.activeTab === 'overview') {
    requestAnimationFrame(() => {
      if (Date.now() > Number(state.alertFocusUntil || 0) || state.activeTab !== 'overview') return;
      const alertTarget = document.querySelector('#alertList button[data-overview-signal-action="alert-focus"]');
      if (alertTarget && typeof alertTarget.focus === 'function') alertTarget.focus({ preventScroll: true });
    });
  }
  renderRetention(data);
}
