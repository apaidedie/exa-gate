import { computeTotals, displayLabelById, el, esc, fmt, isOperationalLog, labelOf, ms, pct, setInsightCard, setWidth, stamp, state, statusOf } from '../state.js';

function updateMetricMeters(totals) {
  const avgLatency = totals.latencyCount ? Math.round(totals.latency / totals.latencyCount) : 0;
  setWidth('usageMeter', totals.requests > 0 ? Math.min(100, Math.max(8, Math.log10(totals.requests + 1) * 24)) : 0);
  setWidth('successMeter', totals.requests > 0 ? totals.success / totals.requests * 100 : 0);
  setWidth('rateLimitMeter', totals.requests > 0 ? totals.rateLimits / totals.requests * 100 : 0);
  setWidth('latencyMeter', avgLatency > 0 ? Math.min(100, avgLatency / 3000 * 100) : 0);
  setWidth('failureMeter', totals.requests > 0 ? totals.failures / totals.requests * 100 : 0);
}

function setProxyFlowNode(id, tone, value, hint, actionId) {
  const node = el(id);
  const valueEl = el(id + 'Value');
  const hintEl = el(id + 'Hint');
  if (!node) return;
  node.className = 'proxy-flow-node overview-signal ' + tone;
  if (valueEl) valueEl.textContent = value;
  if (hintEl) hintEl.textContent = hint;
  if (actionId) node.dataset.overviewSignalAction = actionId;
  const stage = node.querySelector('.proxy-flow-stage')?.textContent?.trim() || '代理链路';
  const valueText = String(value || '').trim() || '-';
  const actionHint = {
    'logs-focus': '点击打开请求日志复核该阶段流量',
    'log-errors': '点击筛选异常请求日志并查看链路',
    'log-rate-limit': '点击筛选 429 请求日志并收窄路径',
    keys: '点击打开密钥池复核调度状态',
    'keys-problem': '点击筛选异常密钥并评估处理'
  }[actionId || ''] || '点击查看相关详情';
  node.setAttribute('aria-label', stage + '：' + valueText + '。' + actionHint);
}

function statusTone(status) {
  const code = Number(status);
  if (!Number.isFinite(code)) return 'blue';
  if (code >= 500) return 'bad';
  if (code >= 400) return 'warn';
  return 'good';
}

function flowPath(log) {
  if (!log) return '-';
  const method = log.method ? String(log.method).toUpperCase() + ' ' : '';
  return method + (log.path || '-');
}

function renderProxyFlowMap(totals, latestLog, latestErrorLog, severity) {
  const config = state.config || {};
  const upstream = config.upstream || 'Exa API';
  const tokenTone = latestLog?.tokenId ? 'good' : state.keys.length ? 'blue' : 'warn';
  const tokenValue = latestLog?.tokenId ? latestLog.tokenId : '待请求';
  const tokenHint = latestLog?.tokenId ? '最近客户端令牌已通过代理认证' : '用客户端令牌发起请求后形成链路样本';
  const proxyTone = latestLog ? statusTone(latestLog.status) : severity;
  const proxyValue = latestLog ? flowPath(latestLog) : (state.keys.length ? '待观测' : '未配置密钥');
  const proxyHint = latestLog ? '状态 ' + (latestLog.status || '-') + ' · ' + ms(latestLog.latencyMs) : '最近请求会显示路径、状态和延迟';
  const keyTone = totals.healthy === 0 ? (state.keys.length ? 'bad' : 'warn') : totals.cooldown || totals.disabled ? 'warn' : 'good';
  const keyValue = fmt(totals.healthy) + ' / ' + fmt(state.keys.length) + ' 健康';
  const keyHint = state.keys.length ? '冷却 ' + fmt(totals.cooldown) + ' · 禁用 ' + fmt(totals.disabled) : '导入 Exa Key 后开始调度';
  const upstreamTone = latestErrorLog ? statusTone(latestErrorLog.status) : latestLog ? statusTone(latestLog.status) : 'blue';
  const upstreamValue = latestLog ? 'HTTP ' + (latestLog.status || '-') : '待响应';
  const upstreamHint = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) + ' · ' + (latestErrorLog.path || '-') : latestLog ? (latestLog.errorCode ? labelOf(latestLog.errorCode) : '上游响应来自 ' + upstream) : '成功或失败会回写请求日志';
  const summary = !state.keys.length ? '链路尚未闭环：先导入 Exa Key，再用客户端令牌发起一次代理请求。' : latestLog ? '最近链路：' + flowPath(latestLog) + ' 经 ' + (Array.isArray(latestLog.keyIds) && latestLog.keyIds.length ? latestLog.keyIds.map(displayLabelById).join(' -> ') : '密钥池') + ' 返回 ' + (latestLog.status || '-') + '。' : '代理已具备密钥池上下文，待第一条客户端请求形成完整链路。';
  const summaryNext = !state.keys.length
    ? '可打开密钥池批量导入'
    : latestLog
      ? (latestErrorLog ? '可筛选异常请求日志查看链路' : '可打开请求日志复核最近链路')
      : '可发起探测请求或查看请求日志';
  const summaryEl = el('proxyFlowSummary');
  if (summaryEl) {
    summaryEl.textContent = summary;
    summaryEl.setAttribute('role', 'status');
    summaryEl.setAttribute('aria-live', 'polite');
    summaryEl.setAttribute('aria-atomic', 'true');
    summaryEl.setAttribute('aria-label', '代理链路摘要：' + summary + summaryNext);
  }
  setProxyFlowNode('proxyFlowToken', tokenTone, tokenValue, tokenHint, 'logs-focus');
  setProxyFlowNode('proxyFlowProxy', proxyTone, proxyValue, proxyHint, latestErrorLog ? 'log-errors' : 'logs-focus');
  setProxyFlowNode('proxyFlowKey', keyTone, keyValue, keyHint, keyTone === 'good' ? 'keys' : 'keys-problem');
  setProxyFlowNode('proxyFlowUpstream', upstreamTone, upstreamValue, upstreamHint, latestErrorLog ? (Number(latestErrorLog.status) === 429 || latestErrorLog.errorCode === 'rate_limit' ? 'log-rate-limit' : 'log-errors') : 'logs-focus');
}

function activityAction(log) {
  const status = Number(log?.status);
  if (status === 429 || log?.errorCode === 'rate_limit') return 'log-rate-limit';
  if (log?.errorCode || (Number.isFinite(status) && status >= 400)) return 'log-errors';
  return 'logs-focus';
}

function activityKeyLabel(log) {
  const ids = Array.isArray(log?.keyIds) ? log.keyIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) return log?.tokenId ? '令牌 ' + log.tokenId : '未匹配密钥';
  const labels = ids.map(displayLabelById);
  return labels.length > 1 ? labels[0] + ' +' + (labels.length - 1) : labels[0];
}

function activityStatusText(log) {
  const status = Number(log?.status);
  if (Number.isFinite(status)) return String(status);
  return labelOf(log?.errorCode);
}

function renderActivityItem(log) {
  const method = String(log.method || 'REQ').toUpperCase();
  const path = String(log.path || '-');
  const statusTextValue = activityStatusText(log);
  const latency = ms(log.latencyMs);
  const keyLabel = activityKeyLabel(log);
  const timeLabel = stamp(log.createdAt);
  const reason = log.errorCode ? labelOf(log.errorCode) : (log.requestId ? String(log.requestId) : '请求完成');
  const tone = log.errorCode ? (Number(log.status) >= 500 ? 'bad' : 'warn') : statusTone(log.status);
  const action = activityAction(log);
  const nextHint = action === 'log-rate-limit'
    ? '点击筛选 429 请求日志并收窄路径'
    : action === 'log-errors'
      ? '点击筛选异常请求日志并查看链路'
      : '点击打开请求日志复核该请求';
  const ariaLabel = '最近请求：' + method + ' ' + path + '，状态 ' + statusTextValue + '，耗时 ' + latency + '。' + nextHint;
  return '<button class="recent-activity-item overview-signal ' + esc(tone) + '" type="button" data-overview-signal-action="' + esc(action) + '" aria-label="' + esc(ariaLabel) + '">' +
    '<span class="recent-activity-head"><span class="recent-activity-method">' + esc(method) + '</span><strong class="mono recent-activity-path">' + esc(path) + '</strong></span>' +
    '<span class="recent-activity-meta"><span class="badge ' + esc(tone) + '" aria-hidden="true">HTTP ' + esc(statusTextValue) + '</span><span>' + esc(latency) + '</span><span>' + esc(keyLabel) + '</span></span>' +
    '<small>' + esc(timeLabel) + ' · ' + esc(reason) + '</small>' +
  '</button>';
}

function renderRecentActivityRail(operationalLogs) {
  const title = el('recentActivityTitle');
  const meta = el('recentActivityMeta');
  const list = el('recentActivityList');
  if (!list) return;
  const recent = operationalLogs.slice(0, 4);
  if (!recent.length) {
    const hasKeys = state.keys.length > 0;
    const titleText = '暂无请求活动';
    const metaText = hasKeys ? '密钥池已就绪，待客户端流量形成证据。' : '先导入 Exa Key，再发起代理请求。';
    const nextAction = hasKeys ? '可查看请求日志或发起探测请求' : '可导入密钥后再观察活动';
    if (title) {
      title.textContent = titleText;
      title.setAttribute('role', 'status');
      title.setAttribute('aria-live', 'polite');
      title.setAttribute('aria-atomic', 'true');
      title.setAttribute('aria-label', '最近活动：' + titleText + '。' + nextAction);
    }
    if (meta) {
      meta.textContent = metaText;
      meta.setAttribute('role', 'status');
      meta.setAttribute('aria-live', 'polite');
      meta.setAttribute('aria-atomic', 'true');
      meta.setAttribute('aria-label', '最近活动说明：' + metaText + '。' + nextAction);
    }
    const secondary = hasKeys
      ? '<button class="ghost-btn" type="button" data-overview-signal-action="keys" aria-label="点击打开密钥池确认调度就绪。暂无活动时可继续管理密钥">打开密钥池</button>'
      : '<button class="ghost-btn" type="button" data-overview-signal-action="import-keys" aria-label="点击打开批量导入上游密钥。导入后可发起探测形成活动样本">导入密钥</button>';
    const hint = hasKeys
      ? '用客户端令牌发起探测请求后，这里会显示最近 4 次链路证据。'
      : '导入至少一把密钥后，再发起代理请求形成活动样本。';
    list.innerHTML = '<div class="recent-activity-empty">'
      + '<strong>暂无请求日志</strong>'
      + '<span>' + esc(hint) + '</span>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-overview-signal-action="logs-focus" aria-label="点击打开请求日志查看是否已有流量。暂无活动时可继续筛选或等待样本">查看请求日志</button>'
      + secondary
      + '<span>切换窗口或核对日志</span>'
      + '</div>'
      + '</div>';
    list.setAttribute('role', 'status');
    list.setAttribute('aria-live', 'polite');
    list.setAttribute('aria-atomic', 'true');
    list.setAttribute('aria-label', '最近请求活动：暂无样本。' + nextAction);
    delete list.dataset.latestStatus;
    return;
  }
  const latest = recent[0];
  const failures = recent.filter((log) => log.errorCode || Number(log.status) >= 400).length;
  const titleText = '最近 ' + fmt(recent.length) + ' 次请求';
  const metaText = failures
    ? '最近样本包含 ' + fmt(failures) + ' 条异常，点击可直接筛选日志。'
    : '最近样本均正常，可继续观察链路延迟。';
  const nextAction = failures ? '可点击异常项筛选请求日志并查看链路' : '可点击条目打开请求日志复核该请求';
  if (title) {
    title.textContent = titleText;
    title.setAttribute('role', 'status');
    title.setAttribute('aria-live', 'polite');
    title.setAttribute('aria-atomic', 'true');
    title.setAttribute('aria-label', '最近活动：' + titleText + '。' + nextAction);
  }
  if (meta) {
    meta.textContent = metaText;
    meta.setAttribute('role', 'status');
    meta.setAttribute('aria-live', 'polite');
    meta.setAttribute('aria-atomic', 'true');
    meta.setAttribute('aria-label', '最近活动说明：' + metaText + '。' + nextAction);
  }
  list.innerHTML = recent.map(renderActivityItem).join('');
  list.setAttribute('role', 'status');
  list.setAttribute('aria-live', 'polite');
  list.setAttribute('aria-atomic', 'false');
  list.setAttribute('aria-label', '最近请求活动：' + titleText + (failures ? '，含 ' + fmt(failures) + ' 条异常' : '') + '。' + nextAction);
  list.dataset.latestStatus = String(latest.status || '');
}

function updateOpsStrip(totals) {
  const totalKeys = Math.max(state.keys.length, 1);
  const healthyRatio = totals.healthy / totalKeys * 100;
  const cooldownRatio = totals.cooldown / totalKeys * 100;
  const disabledRatio = totals.disabled / totalKeys * 100;
  const operationalLogs = state.logs.filter(isOperationalLog);
  const latestLog = operationalLogs[0] || null;
  const latestErrorLog = operationalLogs.find((log) => log.errorCode || Number(log.status) >= 400);
  const severity = totals.healthy === 0 && state.keys.length ? 'bad' : totals.cooldown || totals.failures ? 'warn' : 'good';
  const severityText = severity === 'good' ? '稳定' : severity === 'warn' ? '需关注' : '故障';
  const alertText = severity === 'good' ? '暂无需要人工处理的告警。' : severity === 'warn' ? '告警摘要：存在冷却中密钥或上游错误，请关注重试与失败趋势。' : '告警摘要：当前没有健康密钥，请立即恢复密钥池。';
  const healthyEl = el('healthyKeyCount');
  if (healthyEl) {
    healthyEl.textContent = String(totals.healthy);
    healthyEl.setAttribute('role', 'status');
    healthyEl.setAttribute('aria-live', 'polite');
    healthyEl.setAttribute('aria-atomic', 'true');
    healthyEl.setAttribute('aria-label', '健康密钥：' + fmt(totals.healthy) + '。' + (totals.healthy ? '可继续观察调度，或打开密钥池复核' : '请导入或恢复可用密钥，可打开密钥池处理'));
  }
  const cooldownEl = el('cooldownKeyCount');
  if (cooldownEl) {
    cooldownEl.textContent = String(totals.cooldown);
    cooldownEl.setAttribute('role', 'status');
    cooldownEl.setAttribute('aria-live', 'polite');
    cooldownEl.setAttribute('aria-atomic', 'true');
    cooldownEl.setAttribute('aria-label', '冷却处理：' + fmt(totals.cooldown) + '。' + (totals.cooldown ? '可打开密钥池筛选异常项并重置冷却' : '当前无需处理冷却，可继续观察'));
  }
  const disabledEl = el('disabledKeyCount');
  if (disabledEl) {
    disabledEl.textContent = String(totals.disabled);
    disabledEl.setAttribute('role', 'status');
    disabledEl.setAttribute('aria-live', 'polite');
    disabledEl.setAttribute('aria-atomic', 'true');
    disabledEl.setAttribute('aria-label', '已禁用密钥：' + fmt(totals.disabled) + '。' + (totals.disabled ? '可打开密钥池筛选禁用项并评估是否恢复' : '当前没有禁用密钥，可继续观察'));
  }
  el('healthyPct').textContent = Math.round(healthyRatio) + '%';
  el('cooldownPct').textContent = Math.round(cooldownRatio) + '%';
  el('disabledPct').textContent = Math.round(disabledRatio) + '%';
  setWidth('healthyBar', healthyRatio);
  setWidth('cooldownBar', cooldownRatio);
  setWidth('disabledBar', disabledRatio);
  const severityNext = severity === 'good'
    ? '可继续观察运行态势'
    : severity === 'warn'
      ? '建议打开异常密钥与请求日志复核'
      : '请立即打开密钥池恢复可用密钥';
  const severityEl = el('opsSeverity');
  if (severityEl) {
    severityEl.className = 'badge ' + severity;
    severityEl.textContent = severityText;
    severityEl.setAttribute('role', 'status');
    severityEl.setAttribute('aria-live', 'polite');
    severityEl.setAttribute('aria-atomic', 'true');
    severityEl.setAttribute('aria-label', '运行态势：' + severityText + '。' + severityNext);
  }
  const alertEl = el('opsAlert');
  if (alertEl) {
    alertEl.className = 'ops-alert ' + severity;
    alertEl.textContent = alertText;
    alertEl.setAttribute('role', severity === 'bad' ? 'alert' : 'status');
    alertEl.setAttribute('aria-live', severity === 'bad' ? 'assertive' : 'polite');
    alertEl.setAttribute('aria-atomic', 'true');
    alertEl.setAttribute('aria-label', '运行提示：' + alertText + '。' + severityNext);
  }
  const latestTone = latestErrorLog ? (Number(latestErrorLog.status) >= 500 ? 'bad' : 'warn') : 'good';
  const latestStatusText = latestErrorLog ? labelOf(latestErrorLog.errorCode || 'upstream_error') : '无异常';
  const latestErrorText = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) : '-';
  const latestPathText = latestLog ? String(latestLog.path || '-') : '-';
  const latestChainText = latestLog && Array.isArray(latestLog.keyIds) ? latestLog.keyIds.map(displayLabelById).join(' -> ') : '-';
  const latestNext = latestErrorLog ? '可打开请求日志定位链路并查看详情' : '可继续观察最近请求，或打开日志复核';
  const latestStatusEl = el('latestStatus');
  if (latestStatusEl) {
    latestStatusEl.className = 'badge ' + latestTone;
    latestStatusEl.textContent = latestStatusText;
    latestStatusEl.setAttribute('role', latestTone === 'bad' ? 'alert' : 'status');
    latestStatusEl.setAttribute('aria-live', latestTone === 'bad' ? 'assertive' : 'polite');
    latestStatusEl.setAttribute('aria-atomic', 'true');
    latestStatusEl.setAttribute('aria-label', '链路状态：' + latestStatusText + '。' + latestNext);
  }
  const latestErrorEl = el('latestError');
  if (latestErrorEl) {
    latestErrorEl.textContent = latestErrorText;
    latestErrorEl.setAttribute('role', 'status');
    latestErrorEl.setAttribute('aria-live', 'polite');
    latestErrorEl.setAttribute('aria-atomic', 'true');
    latestErrorEl.setAttribute('aria-label', '最近错误：' + latestErrorText + '。' + (latestErrorLog ? '可打开日志筛选异常请求' : '当前无错误样本，可继续观察'));
  }
  const latestPathEl = el('latestPath');
  if (latestPathEl) {
    latestPathEl.textContent = latestPathText;
    latestPathEl.setAttribute('role', 'status');
    latestPathEl.setAttribute('aria-live', 'polite');
    latestPathEl.setAttribute('aria-atomic', 'true');
    latestPathEl.setAttribute('aria-label', '最后路径：' + latestPathText + '。' + (latestLog ? '可到请求日志按路径收窄' : '可等待新请求样本，或打开日志复核'));
  }
  const latestChainEl = el('latestChain');
  if (latestChainEl) {
    latestChainEl.textContent = latestChainText;
    latestChainEl.setAttribute('role', 'status');
    latestChainEl.setAttribute('aria-live', 'polite');
    latestChainEl.setAttribute('aria-atomic', 'true');
    latestChainEl.setAttribute('aria-label', '密钥链路：' + latestChainText + '。' + (latestLog ? '可打开密钥详情复核' : '可等待链路样本，或打开密钥池复核'));
  }
  renderProxyFlowMap(totals, latestLog, latestErrorLog, severity);
  renderRecentActivityRail(operationalLogs);
}

function updateOverviewInsights(totals) {
  const operationalLogs = state.logs.filter(isOperationalLog);
  const latestErrorLog = operationalLogs.find((log) => log.errorCode || Number(log.status) >= 400);
  const hasHealthyKey = state.keys.some((key) => statusOf(key) === 'Healthy');
  const hasRequests = totals.requests > 0 || operationalLogs.length > 0;
  const errorRate = totals.requests > 0 ? totals.failures / totals.requests : 0;
  const rateLimitRate = totals.requests > 0 ? totals.rateLimits / totals.requests : 0;

  if (!state.keys.length) {
    setInsightCard('insightJudgement', 'bad', '密钥池尚未配置', '导入至少一把 Exa Key 后，代理才会开始处理客户端请求。');
    setInsightCard('insightNextAction', 'warn', '批量导入密钥', '打开密钥池的批量导入，完成后再观察请求趋势。', { id: 'import-keys', label: '导入密钥' });
    return;
  }
  if (!hasHealthyKey) {
    setInsightCard('insightJudgement', 'bad', '没有健康密钥', '所有可用密钥都处于禁用或冷却状态，客户端请求会持续失败。');
    setInsightCard('insightNextAction', 'bad', '恢复密钥池', '优先启用或测试密钥，并重置确认可恢复的冷却项。', { id: 'keys-problem', label: '查看异常密钥' });
    return;
  }
  if (!hasRequests) {
    setInsightCard('insightJudgement', 'warn', '代理已就绪，待流量', '密钥池可用，但当前窗口还没有可分析的客户端请求。');
    setInsightCard('insightNextAction', 'blue', '发起一次探测请求', '用客户端令牌调用代理路径，验证认证、路由和上游响应。', { id: 'logs-focus', label: '查看请求日志' });
    return;
  }
  if (latestErrorLog || errorRate >= 0.05 || rateLimitRate >= 0.05 || totals.cooldown > 0) {
    const reason = latestErrorLog ? labelOf(latestErrorLog.errorCode || latestErrorLog.status) : totals.cooldown ? '密钥冷却' : rateLimitRate >= 0.05 ? '限流升高' : '失败升高';
    setInsightCard('insightJudgement', 'warn', '运行中，需要关注', '最近窗口出现 ' + reason + '，建议结合趋势和请求链路确认影响范围。');
    setInsightCard('insightNextAction', 'warn', '查看异常密钥与日志', '先筛选异常密钥，再打开请求日志的链路诊断定位失败路径。', { id: totals.cooldown > 0 ? 'keys-problem' : 'logs-focus', label: totals.cooldown > 0 ? '筛选异常密钥' : '定位请求日志' });
    return;
  }
  setInsightCard('insightJudgement', 'good', '运行稳定', '健康密钥可用，当前窗口内没有需要立即处理的异常信号。');
  setInsightCard('insightNextAction', 'blue', '继续观察趋势', '保持自动刷新，必要时切换 1 小时或 7 天窗口对比变化。', { id: 'trend-focus', label: '调整观测窗口' });
}

export function updateSummary() {
  const totals = computeTotals(state.keys);
  const errorRate = pct(totals.failures, totals.requests);
  const hasHealthyKey = state.keys.some((key) => statusOf(key) === 'Healthy');
  const serviceClass = hasHealthyKey ? '' : totals.active ? 'warn' : 'bad';
  const serviceText = hasHealthyKey ? '运行中' : totals.active ? '降级' : '无可用';
  el('serviceDot').className = 'status-dot ' + serviceClass;
  el('serviceDot')?.setAttribute('aria-hidden', 'true');
  el('serviceStatus').textContent = serviceText;
  el('activeKeys').textContent = String(totals.active);
  el('totalRequests').textContent = fmt(totals.requests);
  el('errorRate').textContent = errorRate;
  el('errorRate').className = 'summary-value ' + (totals.failures ? 'bad' : 'good');
  const serviceBtn = document.querySelector('[data-summary-metric="service"]');
  if (serviceBtn) serviceBtn.setAttribute('aria-label', '服务状态：' + serviceText + '。点击打开密钥池复核调度');
  const activeKeysBtn = document.querySelector('[data-summary-metric="active-keys"]');
  if (activeKeysBtn) activeKeysBtn.setAttribute('aria-label', '启用密钥：' + fmt(totals.active) + '。点击打开密钥池管理启用项');
  const totalRequestsBtn = document.querySelector('[data-summary-metric="total-requests"]');
  if (totalRequestsBtn) totalRequestsBtn.setAttribute('aria-label', '请求总量：' + fmt(totals.requests) + '。点击打开请求日志复核流量');
  const errorRateBtn = document.querySelector('[data-summary-metric="error-rate"]');
  if (errorRateBtn) errorRateBtn.setAttribute('aria-label', '错误率：' + errorRate + '。点击筛选错误请求日志');
  const usageText = fmt(totals.requests);
  const successText = pct(totals.success, totals.requests);
  const rateLimitText = fmt(totals.rateLimits);
  const latencyText = ms(totals.latencyCount ? Math.round(totals.latency / totals.latencyCount) : 0);
  const failureText = fmt(totals.failures);
  el('usageMetric').textContent = usageText;
  el('successMetric').textContent = successText;
  el('rateLimitMetric').textContent = rateLimitText;
  el('latencyMetric').textContent = latencyText;
  el('failureMetric').textContent = failureText;
  const usageCard = document.querySelector('[data-metric-card="usage"]');
  if (usageCard) usageCard.setAttribute('aria-label', '用量：' + usageText + '。点击查看近 24 小时请求日志');
  const successCard = document.querySelector('[data-metric-card="success"]');
  if (successCard) successCard.setAttribute('aria-label', '成功率：' + successText + '。点击查看成功请求日志');
  const rateLimitCard = document.querySelector('[data-metric-card="rate-limit"]');
  if (rateLimitCard) rateLimitCard.setAttribute('aria-label', '限流 429：' + rateLimitText + '。点击筛选 429 请求日志');
  const latencyCard = document.querySelector('[data-metric-card="latency"]');
  if (latencyCard) latencyCard.setAttribute('aria-label', '平均延迟：' + latencyText + '。点击查看最近响应日志');
  const failureCard = document.querySelector('[data-metric-card="failure"]');
  if (failureCard) failureCard.setAttribute('aria-label', '失败数：' + failureText + '。点击筛选失败请求日志');
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
  updateMetricMeters(totals);
  updateOpsStrip(totals);
  updateOverviewInsights(totals);
}
