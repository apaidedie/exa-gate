import { computeTotals, el, fmt, isOperationalLog, labelOf, pct, setInsightCard, setWidth, state, statusOf } from '../state.js';
import { windowTrafficStats } from '../overview/render-metrics.js';

function trafficSnapshot(totals) {
  const window = windowTrafficStats();
  const operationalLogs = state.logs.filter(isOperationalLog);
  const requests = window ? window.requests : totals.requests;
  const failures = window ? window.failures : totals.failures;
  const rateLimits = window ? window.rateLimits : totals.rateLimits;
  const source = window ? 'window' : (totals.requests > 0 ? 'keys' : (operationalLogs.length ? 'logs' : 'none'));
  return {
    window,
    operationalLogs,
    requests: source === 'logs' ? operationalLogs.length : requests,
    failures: source === 'logs'
      ? operationalLogs.filter((log) => log.errorCode || Number(log.status) >= 400).length
      : failures,
    rateLimits,
    source
  };
}

function updateOpsStrip(totals) {
  const totalKeys = Math.max(state.keys.length, 1);
  const healthyRatio = totals.healthy / totalKeys * 100;
  const cooldownRatio = totals.cooldown / totalKeys * 100;
  const disabledRatio = totals.disabled / totalKeys * 100;
  el('healthyPct').textContent = Math.round(healthyRatio) + '%';
  el('cooldownPct').textContent = Math.round(cooldownRatio) + '%';
  el('disabledPct').textContent = Math.round(disabledRatio) + '%';
  setWidth('healthyBar', healthyRatio);
  setWidth('cooldownBar', cooldownRatio);
  setWidth('disabledBar', disabledRatio);
}

function updateOverviewInsights(totals) {
  const traffic = trafficSnapshot(totals);
  const latestErrorLog = traffic.operationalLogs.find((log) => log.errorCode || Number(log.status) >= 400);
  const hasHealthyKey = state.keys.some((key) => statusOf(key) === 'Healthy');
  const hasRequests = traffic.requests > 0;
  const errorRate = traffic.requests > 0 ? traffic.failures / traffic.requests : 0;
  const rateLimitRate = traffic.requests > 0 ? traffic.rateLimits / traffic.requests : 0;

  if (!state.keys.length) {
    setInsightCard('insightNextAction', 'warn', '导入密钥', '打开密钥池批量导入。', { id: 'import-keys', label: '导入密钥' });
    return;
  }
  if (!hasHealthyKey) {
    setInsightCard('insightNextAction', 'bad', '恢复密钥池', '启用、测试或重置冷却。', { id: 'keys-problem', label: '查看异常' });
    return;
  }
  if (!hasRequests) {
    setInsightCard('insightNextAction', 'blue', '等待探测流量', '用客户端令牌打一次代理接口后回来复核。', { id: 'logs-focus', label: '打开日志' });
    return;
  }
  if (latestErrorLog || errorRate >= 0.05 || rateLimitRate >= 0.05 || totals.cooldown > 0) {
    const hasKeyProblems = totals.cooldown > 0 || totals.disabled > 0 || state.keys.some((key) => Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0);
    const reason = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) : totals.cooldown ? '密钥冷却' : rateLimitRate >= 0.05 ? '限流升高' : '失败升高';
    // Prefer logs when traffic is bad but the key pool itself looks healthy (e.g. 401 probes).
    const nextId = hasKeyProblems ? 'keys-problem' : (rateLimitRate >= 0.05 ? 'log-rate-limit' : 'log-errors');
    const nextLabel = hasKeyProblems ? '筛选异常密钥' : (rateLimitRate >= 0.05 ? '筛选 429' : '筛选失败日志');
    const nextText = hasKeyProblems ? '先看异常密钥，再查请求链路。' : '密钥池健康，优先按失败请求复核链路。';
    setInsightCard('insightNextAction', 'warn', '排查异常（' + reason + '）', nextText, { id: nextId, label: nextLabel });
    return;
  }
  setInsightCard('insightNextAction', 'blue', '继续观察', '可切换趋势窗口对比。', { id: 'trend-focus', label: '调整窗口' });
}

function updateDashHero(totals, serviceText, hasHealthyKey) {
  const title = el('dashHeroTitle');
  const line = el('dashHeroLine');
  if (!title || !line) return;
  const healthy = fmt(totals.healthy);
  const keys = fmt(state.keys.length);
  const traffic = trafficSnapshot(totals);
  const reqs = fmt(traffic.requests);
  const err = pct(traffic.failures, traffic.requests);
  if (!state.keys.length) {
    title.textContent = '尚未就绪';
    line.textContent = '导入至少一把密钥后开始调度。';
    return;
  }
  if (!hasHealthyKey) {
    title.textContent = '需要处理';
    line.textContent = keys + ' 把密钥 · 当前无健康项 · ' + serviceText;
    return;
  }
  if (!traffic.requests) {
    title.textContent = '池子就绪';
    line.textContent = healthy + ' / ' + keys + ' 健康 · 当前窗口暂无流量';
    return;
  }
  if (traffic.failures || totals.cooldown || (traffic.requests && traffic.failures / traffic.requests >= 0.05)) {
    title.textContent = traffic.failures / traffic.requests >= 0.5 ? '需要关注' : '运行中';
    line.textContent = healthy + ' 健康 · 窗口 ' + reqs + ' 请求 · 失败率 ' + err;
    return;
  }
  title.textContent = '运行稳定';
  line.textContent = healthy + ' 健康 · 窗口 ' + reqs + ' 请求 · 失败率 ' + err;
}

export function updateSummary() {
  const totals = computeTotals(state.keys);
  const traffic = trafficSnapshot(totals);
  const errorRate = pct(traffic.failures, traffic.requests);
  const hasHealthyKey = state.keys.some((key) => statusOf(key) === 'Healthy');
  const serviceClass = hasHealthyKey ? '' : totals.active ? 'warn' : 'bad';
  const serviceText = hasHealthyKey ? '运行中' : totals.active ? '降级' : '无可用';
  const windowLabel = state.observability?.window?.label || '近 24 小时';
  el('serviceDot').className = 'status-dot ' + serviceClass;
  el('serviceDot')?.setAttribute('aria-hidden', 'true');
  el('serviceStatus').textContent = serviceText;
  // KPI card shows healthy keys; keep id activeKeys for existing selectors/tests.
  el('activeKeys').textContent = String(totals.healthy);
  // Prefer observability window so Hero/KPI/trend share one traffic story.
  el('totalRequests').textContent = fmt(traffic.requests);
  el('errorRate').textContent = errorRate;
  el('errorRate').className = 'summary-value ' + (traffic.failures ? 'bad' : 'good');
  const keysHint = el('activeKeysHint');
  if (keysHint) keysHint.textContent = fmt(totals.healthy) + ' / ' + fmt(state.keys.length) + ' 健康';
  const reqHint = el('totalRequestsHint');
  if (reqHint) {
    reqHint.textContent = traffic.source === 'window'
      ? (windowLabel + (traffic.failures ? ' · 失败 ' + fmt(traffic.failures) : ' · 观测窗口'))
      : ('密钥累计' + (traffic.failures ? ' · 失败 ' + fmt(traffic.failures) : ''));
  }
  const errHint = el('errorRateHint');
  if (errHint) errHint.textContent = traffic.failures ? '失败 ' + fmt(traffic.failures) + ' 次' : (traffic.requests ? '窗口内稳定' : '暂无窗口样本');
  const serviceHint = el('serviceStatusHint');
  if (serviceHint) serviceHint.textContent = hasHealthyKey ? '调度就绪' : (totals.active ? '部分密钥不可用' : '请导入或恢复密钥');
  const serviceBtn = document.querySelector('[data-summary-metric="service"]');
  if (serviceBtn) serviceBtn.setAttribute('aria-label', '服务状态：' + serviceText + '。点击打开密钥池复核调度');
  const activeKeysBtn = document.querySelector('[data-summary-metric="active-keys"]');
  if (activeKeysBtn) activeKeysBtn.setAttribute('aria-label', '健康密钥：' + fmt(totals.healthy) + '。点击打开密钥池管理启用项');
  const totalRequestsBtn = document.querySelector('[data-summary-metric="total-requests"]');
  if (totalRequestsBtn) totalRequestsBtn.setAttribute('aria-label', '请求总量：' + fmt(traffic.requests) + '。点击打开请求日志复核流量');
  const errorRateBtn = document.querySelector('[data-summary-metric="error-rate"]');
  if (errorRateBtn) errorRateBtn.setAttribute('aria-label', '错误率：' + errorRate + '。点击筛选错误请求日志');
  const keyCountText = fmt(state.keys.length) + ' 个密钥';
  const keyCountEl = el('keyCount');
  if (keyCountEl) {
    const keyCountNext = state.keys.length
      ? '可搜索、筛选或打开详情管理密钥'
      : '可批量导入密钥后开始调度';
    keyCountEl.textContent = keyCountText;
    keyCountEl.setAttribute('role', 'status');
    keyCountEl.setAttribute('aria-live', 'polite');
    keyCountEl.setAttribute('aria-atomic', 'true');
    keyCountEl.setAttribute('aria-label', '密钥池：' + keyCountText + '。' + keyCountNext);
  }
  updateOpsStrip(totals);
  updateOverviewInsights(totals);
  updateDashHero(totals, serviceText, hasHealthyKey);
}
