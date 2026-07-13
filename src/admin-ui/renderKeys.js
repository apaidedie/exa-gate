import { classForStatus, computeTotals, cooldownLeft, displayLabel, displayLabelById, el, esc, fmt, isOperationalLog, labelOf, ms, observedRequestsFor, pct, rawDisplayLabel, setInsightCard, setWidth, stamp, state, statusOf, statusText } from './state.js';

export function syncSecretToggleState() {
  const button = el('toggleSecretDisplay');
  if (!button) return;
  const showingPlain = state.secretDisplay === 'plain';
  button.textContent = showingPlain ? '隐藏原文' : '显示原文';
  button.setAttribute('aria-pressed', String(showingPlain));
  button.classList.toggle('is-plain', showingPlain);
  button.setAttribute(
    'aria-label',
    showingPlain
      ? '密钥显示方式：原文。点击切换为脱敏显示'
      : '密钥显示方式：脱敏。点击切换为显示原文'
  );
}

export function syncSelectAllKeysControl() {
  const selectAll = el('selectAllKeys');
  if (!selectAll) return;
  const pageIds = Array.isArray(state.pageKeyIds) ? state.pageKeyIds : [];
  const selected = new Set(state.selectedKeyIds || []);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const totalOnPage = pageIds.length;
  const allSelected = totalOnPage > 0 && selectedOnPage === totalOnPage;
  const someSelected = selectedOnPage > 0 && selectedOnPage < totalOnPage;
  selectAll.checked = allSelected;
  selectAll.indeterminate = someSelected;
  selectAll.setAttribute('aria-checked', someSelected ? 'mixed' : String(allSelected));
  if (allSelected) {
    selectAll.setAttribute('aria-label', '取消选择当前页全部密钥（已选 ' + fmt(selectedOnPage) + ' 个）。取消后可重新勾选');
  } else if (someSelected) {
    selectAll.setAttribute('aria-label', '当前页部分已选 ' + fmt(selectedOnPage) + ' / ' + fmt(totalOnPage) + '。点击选择当前页全部密钥后可批量操作');
  } else {
    selectAll.setAttribute('aria-label', '选择当前页全部密钥。勾选后可使用批量操作栏');
  }
}

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
      ? '<button class="ghost-btn" type="button" data-overview-signal-action="keys" aria-label="点击打开密钥池确认调度就绪">打开密钥池</button>'
      : '<button class="ghost-btn" type="button" data-overview-signal-action="import-keys" aria-label="点击打开批量导入上游密钥">导入密钥</button>';
    const hint = hasKeys
      ? '用客户端令牌发起探测请求后，这里会显示最近 4 次链路证据。'
      : '导入至少一把密钥后，再发起代理请求形成活动样本。';
    list.innerHTML = '<div class="recent-activity-empty">'
      + '<strong>暂无请求日志</strong>'
      + '<span>' + esc(hint) + '</span>'
      + '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-overview-signal-action="logs-focus" aria-label="点击打开请求日志查看是否已有流量">查看请求日志</button>'
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

function keyScopeText(filter, query) {
  const filterLabels = { All: '全部密钥', Healthy: '健康密钥', Cooldown: '冷却密钥', Disabled: '禁用密钥', Problem: '异常密钥' };
  const base = filterLabels[filter] || '全部密钥';
  if (!query && filter === 'All') return base;
  if (!query) return base;
  const searchText = '搜索 "' + query + '"';
  return filter === 'All' ? searchText : base + ' + ' + searchText;
}

function keyFilterLabel(filter) {
  return { All: '全部', Healthy: '健康', Cooldown: '冷却', Disabled: '禁用', Problem: '异常' }[filter] || '全部';
}

function keyFilterState(filter, query) {
  const filters = [];
  if (query) filters.push({ key: 'query', label: '关键词', value: query });
  if (filter && filter !== 'All') filters.push({ key: 'status', label: '状态', value: keyFilterLabel(filter) });
  return { filters, active: filters.length > 0 };
}

function filterChipMarkup(kind, item) {
  return '<button type="button" class="' + kind + '-filter-chip is-removable" data-filter-remove="' + esc(item.key) + '" aria-label="移除' + esc(item.label) + '筛选：' + esc(item.value) + '。移除后刷新匹配结果"><strong>' + esc(item.label) + '</strong><span class="filter-chip-value">' + esc(item.value) + '</span><span class="filter-chip-remove" aria-hidden="true">×</span></button>';
}

function renderKeyFilterSummary({ rows, filter, query }) {
  const summary = el('keyFilterSummary');
  if (!summary) return;
  const filterState = keyFilterState(filter, query);
  const chips = el('keyFilterSummaryChips');
  const text = el('keyFilterSummaryText');
  const clearButton = el('clearKeyFilters');
  const summaryText = filterState.active
    ? '匹配 ' + fmt(rows.length) + ' 个密钥 · 批量作用于当前页'
    : '全部密钥 · 可按关键词或状态收窄';
  const summaryNext = filterState.active
    ? (rows.length ? '可继续批量操作或清除筛选' : '可清除筛选或调整关键词/状态')
    : '可搜索 ID 或按状态筛选';
  summary.classList.toggle('is-empty', !filterState.active);
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  summary.setAttribute('aria-label', '密钥筛选状态：' + summaryText + '。' + summaryNext);
  if (text) text.textContent = summaryText;
  if (chips) {
    chips.innerHTML = filterState.active
      ? filterState.filters.map((item) => filterChipMarkup('key', item)).join('')
      : '<span class="key-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filterState.active;
}

function renderKeyFilteredEmptyState(filter, query) {
  const filterState = keyFilterState(filter, query);
  const activeChips = filterState.filters.map((item) => item.label + ' · ' + item.value);
  const chips = activeChips.length
    ? activeChips
    : ['检查筛选', '清除筛选', '刷新密钥'];
  const hint = filterState.filters.length
    ? filterState.filters.map((item) => item.label + ' “' + item.value + '”').join('，')
    : '当前筛选条件';
  return '<div class="key-empty-state filtered"><div class="empty-kicker" aria-hidden="true">筛选结果</div><h3>没有匹配的密钥</h3><p>' + esc(hint) + ' 没有命中密钥。可一键清除筛选，或调整关键词与状态条件后继续管理密钥池。</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="clear-filters" aria-label="清除密钥池筛选，恢复全部密钥">清除筛选</button><span>恢复全部密钥列表</span></div></div>';
}

function renderKeyFilteredDetailEmpty() {
  return '<div class="empty key-detail-empty filtered"><div class="empty-kicker" aria-hidden="true">筛选结果</div><h3>当前范围没有可查看密钥</h3><p>清空搜索或状态筛选后，这里会重新显示密钥用量、冷却和最近失败。</p><div class="empty-actions"><button class="ghost-btn" type="button" data-empty-action="clear-filters" aria-label="清除密钥池筛选，恢复全部密钥">清除筛选</button></div></div>';
}

function renderKeyFirstRunDetailEmpty() {
  return '<div class="empty key-detail-empty first-run"><div class="empty-kicker" aria-hidden="true">首次配置</div><h3>导入密钥后显示详情</h3><p>密钥池为空时，这里会展示选中密钥的用量、冷却、最近失败和操作反馈。先导入至少一把上游 Key。</p><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="import" aria-label="打开批量导入密钥。可粘贴或选择文件后预检再提交">批量导入密钥</button><span>与表格导入入口相同</span></div></div>';
}

function renderKeyIdleDetailEmpty() {
  return '<div class="empty key-detail-empty idle">'
    + '<div class="empty-kicker" aria-hidden="true">密钥详情</div>'
    + '<h3>选择一个密钥查看详情</h3>'
    + '<p>在左侧密钥表点击一行或「详情」，这里会显示用量、冷却、最近失败和操作反馈。也可直接查看当前页首个密钥，或用搜索缩小范围。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-empty-action="select-first-key" aria-label="查看当前页首个密钥详情。可在侧栏复核用量与操作">查看首个密钥</button>'
    + '<button class="ghost-btn" type="button" data-empty-action="focus-key-search" aria-label="聚焦密钥搜索框。输入后即时收窄列表">搜索密钥</button>'
    + '<span>或在表格中点选任意密钥</span>'
    + '</div>'
    + '</div>';
}

function keyScopeHint(filter, query, totalPages) {
  if (!query && filter === 'All') return '未筛选';
  const pageHint = fmt(totalPages) + ' 页结果';
  if (query && filter !== 'All') return '组合筛选，' + pageHint;
  if (query) return '关键词范围，' + pageHint;
  return '状态筛选，' + pageHint;
}

function keySortAriaLabel(label, isActive, direction) {
  if (!isActive) return '按' + label + '排序。点击后按升序排列密钥表';
  const current = direction === 'desc' ? '降序' : '升序';
  const next = direction === 'desc' ? '升序' : '降序';
  return '按' + label + '排序，当前' + current + '。再次点击切换为' + next;
}

function syncKeySortHeaders() {
  document.querySelectorAll('.key-table-scroll th.sortable').forEach((th) => {
    const direction = state.keySort.direction === 'desc' ? 'desc' : 'asc';
    const isActive = th.dataset.sort === state.keySort.column;
    const button = th.querySelector('.sort-btn[data-sort]');
    th.classList.toggle('sort-asc', isActive && direction === 'asc');
    th.classList.toggle('sort-desc', isActive && direction === 'desc');
    th.setAttribute('aria-sort', isActive ? (direction === 'desc' ? 'descending' : 'ascending') : 'none');
    if (!button) return;
    const label = button.dataset.sortLabel || button.textContent.trim();
    button.setAttribute('aria-pressed', String(isActive));
    button.setAttribute('aria-label', keySortAriaLabel(label, isActive, direction));
  });
}

function sortKeyRows(rows) {
  if (!state.keySort.column) return rows;
  const col = state.keySort.column;
  const dir = state.keySort.direction === 'desc' ? -1 : 1;
  const sortMap = { requests: 'totalRequests', success: 'successCount', failures: 'failureCount', rateLimits: 'rateLimitCount', timeouts: 'timeoutCount' };
  const field = sortMap[col] || col;
  rows.sort((a, b) => (Number(a[field] || 0) - Number(b[field] || 0)) * dir);
  return rows;
}

function keyRowSignal(key, status, observedRequests) {
  const failures = Number(key.failureCount || 0);
  const rateLimits = Number(key.rateLimitCount || 0);
  const timeouts = Number(key.timeoutCount || 0);
  if (status === 'Disabled') {
    return { tone: 'bad', label: '已停用', detail: '不参与调度' };
  }
  if (status === 'Cooldown') {
    const reason = labelOf(key.cooldownReason);
    const left = cooldownLeft(key.cooldownUntil);
    const detail = (reason === '-' ? '保护中' : reason) + (left === '-' ? '' : ' · ' + left);
    return { tone: 'warn', label: '冷却中', detail };
  }
  if (rateLimits > 0) {
    return { tone: 'warn', label: '429 压力', detail: fmt(rateLimits) + ' 次限流' };
  }
  if (timeouts > 0) {
    return { tone: 'warn', label: '超时压力', detail: fmt(timeouts) + ' 次超时' };
  }
  if (failures > 0) {
    return { tone: 'bad', label: '失败信号', detail: fmt(failures) + ' 次失败' };
  }
  if (!observedRequests) {
    return { tone: 'blue', label: '待样本', detail: '尚无请求' };
  }
  return { tone: 'good', label: '可调度', detail: pct(key.successCount, observedRequests) + ' 成功' };
}

export function updateKeyWorkflowSelection() {
  const selectedCount = state.selectedKeyIds.length;
  const selectedItem = document.querySelector('[data-workflow-item="selected"]');
  if (selectedItem) {
    selectedItem.className = 'key-workflow-item ' + (selectedCount ? 'is-blue' : '');
    selectedItem.disabled = selectedCount === 0;
    const label = selectedCount
      ? '已选择：' + fmt(selectedCount) + '。点击聚焦批量操作栏，可测试/启用/禁用'
      : '已选择：0。勾选密钥后启用批量操作';
    selectedItem.setAttribute('aria-label', label);
    selectedItem.title = label;
  }
  const summary = el('keyWorkflowSummary');
  if (summary) {
    summary.setAttribute(
      'aria-label',
      selectedCount
        ? ('密钥池工作流摘要：已选 ' + fmt(selectedCount) + ' 个。可批量操作、筛选异常或调整搜索')
        : '密钥池工作流摘要：可重置筛选、筛选异常、搜索收窄或勾选后批量操作'
    );
  }
  const selected = el('keyWorkflowSelected');
  const hint = el('keyWorkflowSelectedHint');
  if (selected) selected.textContent = fmt(selectedCount);
  if (hint) hint.textContent = selectedCount ? '批量栏已启用' : '勾选密钥后启用';
}

function syncKeyWorkflowAction(action, disabled, label) {
  const button = document.querySelector('[data-key-workflow-action="' + action + '"]');
  if (!button) return;
  button.disabled = disabled;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function renderKeyWorkflowSummary({ rows, pageRows, problemCount, filter, query, totalPages, start }) {
  const visible = el('keyWorkflowVisible');
  if (!visible) return;
  const visibleHint = el('keyWorkflowVisibleHint');
  const problems = el('keyWorkflowProblems');
  const problemHint = el('keyWorkflowProblemHint');
  const scope = el('keyWorkflowScope');
  const scopeHint = el('keyWorkflowScopeHint');
  const visibleItem = document.querySelector('[data-workflow-item="visible"]');
  const problemItem = document.querySelector('[data-workflow-item="problems"]');
  const scopeItem = document.querySelector('[data-workflow-item="scope"]');
  const pageStart = rows.length ? start + 1 : 0;
  const pageEnd = start + pageRows.length;
  const scopeText = keyScopeText(filter, query);

  const visibleCountText = fmt(rows.length);
  const pageHintText = pageRows.length ? '当前页 ' + fmt(pageStart) + '-' + fmt(pageEnd) : '当前页 0 个';
  const problemHintText = problemCount ? (filter === 'Problem' ? '异常筛选结果' : '冷却 / 禁用 / 错误') : '当前范围稳定';
  const scopeHintText = keyScopeHint(filter, query, totalPages);
  visible.textContent = visibleCountText;
  if (visibleHint) visibleHint.textContent = pageHintText;
  if (problems) problems.textContent = fmt(problemCount);
  if (problemHint) problemHint.textContent = problemHintText;
  if (scope) {
    scope.textContent = scopeText;
  }
  if (scopeHint) scopeHint.textContent = scopeHintText;
  if (visibleItem) visibleItem.className = 'key-workflow-item ' + (rows.length ? 'is-good' : '');
  if (problemItem) problemItem.className = 'key-workflow-item ' + (problemCount ? 'is-warn' : 'is-good');
  if (scopeItem) scopeItem.className = 'key-workflow-item ' + ((query || filter !== 'All') ? 'is-blue' : '');
  const hasFilter = Boolean(query || filter !== 'All');
  const resetAction = hasFilter ? '清除密钥筛选，恢复全部密钥' : '聚焦全部密钥筛选入口';
  const problemAction = problemCount ? '筛选异常密钥并复核' : '当前范围没有异常密钥，可继续观察或导入密钥';
  const scopeAction = hasFilter ? '聚焦密钥搜索，调整当前筛选范围' : '聚焦密钥搜索，收窄密钥范围';
  syncKeyWorkflowAction('reset', false, '当前显示：' + visibleCountText + '，' + pageHintText + '。' + resetAction);
  syncKeyWorkflowAction('problems', problemCount === 0, '异常压力：' + fmt(problemCount) + '，' + problemHintText + '。' + problemAction);
  syncKeyWorkflowAction('scope', false, '筛选范围：' + scopeText + '，' + scopeHintText + '。' + scopeAction);
  if (scope) scope.title = '筛选范围：' + scopeText + '。' + scopeAction;
  updateKeyWorkflowSelection();
}

export function renderKeys() {
  const query = el('keySearch').value.trim().toLowerCase();
  const filter = state.keyFilter || 'All';
  syncSecretToggleState();

  // Compute chip counts across all keys
  let healthyCount = 0, cooldownCount = 0, disabledCount = 0, problemCount = 0;
  const matchesKeyQuery = (key) => key.id.toLowerCase().includes(query) || rawDisplayLabel(key).toLowerCase().includes(query);
  const rows = state.keys.filter((key) => {
    const status = statusOf(key);
    const problem = status === 'Cooldown' || status === 'Disabled' || Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0;
    key._problem = problem;
    if (status === 'Healthy') healthyCount++;
    else if (status === 'Cooldown') cooldownCount++;
    else if (status === 'Disabled') disabledCount++;
    if (problem) problemCount++;
    return matchesKeyQuery(key) && (filter === 'All' || filter === status || (filter === 'Problem' && problem));
  });

  // Update chip counts, active state, and accessible pressed labels
  const chipCounts = { All: state.keys.length, Healthy: healthyCount, Cooldown: cooldownCount, Disabled: disabledCount, Problem: problemCount };
  const chipFilterLabels = {
    All: '全部密钥',
    Healthy: '健康密钥',
    Cooldown: '冷却中密钥',
    Disabled: '已禁用密钥',
    Problem: '异常密钥'
  };
  document.querySelectorAll('#keyFilterChips .chip').forEach((chip) => {
    const value = chip.dataset.chip;
    const selected = value === filter;
    const count = chipCounts[value] || 0;
    const label = chipFilterLabels[value] || value;
    chip.classList.toggle('active', selected);
    chip.setAttribute('aria-pressed', String(selected));
    chip.setAttribute(
      'aria-label',
      selected
        ? ('当前筛选：' + label + '，' + count + ' 个。可切换其他状态或清除筛选')
        : ('筛选' + label + '，' + count + ' 个。点击后收窄密钥表')
    );
    const countSpan = chip.querySelector('.chip-count');
    if (countSpan) {
      countSpan.textContent = String(count);
      countSpan.setAttribute('aria-hidden', 'true');
    }
  });

  // Apply sorting
  sortKeyRows(rows);

  syncKeySortHeaders();

  state.problemKeyIds = rows.filter((key) => key._problem).map((key) => key.id);
  const totalPages = Math.max(1, Math.ceil(rows.length / state.keyPageSize));
  state.keyPage = Math.min(Math.max(1, state.keyPage), totalPages);
  const start = (state.keyPage - 1) * state.keyPageSize;
  const pageRows = rows.slice(start, start + state.keyPageSize);
  state.pageKeyIds = pageRows.map((key) => key.id);
  const visibleProblemCount = state.keys.filter((key) => key._problem && matchesKeyQuery(key)).length;
  if (pageRows.length && !state.pageKeyIds.includes(state.selectedId)) {
    const cooling = pageRows.find((item) => statusOf(item) === 'Cooldown');
    state.selectedId = (cooling || pageRows[0]).id;
  }
  renderKeyWorkflowSummary({ rows, pageRows, problemCount: visibleProblemCount, filter, query, totalPages, start });
  renderKeyFilterSummary({ rows, filter, query });
  const keyPagerText = '显示 ' + fmt(rows.length ? start + 1 : 0) + '-' + fmt(start + pageRows.length) + ' / ' + fmt(rows.length) + ' 个密钥';
  const keyPageLabelText = '第 ' + fmt(state.keyPage) + ' / ' + fmt(totalPages) + ' 页';
  const keyPagerEl = el('keyPager');
  if (keyPagerEl) {
    const pagerNext = rows.length
      ? (totalPages > 1 ? '可用上一页/下一页浏览密钥' : '当前范围仅一页')
      : '可清除筛选或导入密钥';
    keyPagerEl.textContent = keyPagerText;
    keyPagerEl.setAttribute('role', 'status');
    keyPagerEl.setAttribute('aria-live', 'polite');
    keyPagerEl.setAttribute('aria-atomic', 'true');
    keyPagerEl.setAttribute('aria-label', '密钥分页：' + keyPagerText + '。' + pagerNext);
  }
  const keyPageLabelEl = el('keyPageLabel');
  if (keyPageLabelEl) {
    const pageNext = totalPages > 1 ? '可切换页码继续浏览' : '当前仅一页';
    keyPageLabelEl.textContent = keyPageLabelText;
    keyPageLabelEl.setAttribute('role', 'status');
    keyPageLabelEl.setAttribute('aria-live', 'polite');
    keyPageLabelEl.setAttribute('aria-atomic', 'true');
    keyPageLabelEl.setAttribute('aria-label', '密钥页码：' + keyPageLabelText + '。' + pageNext);
  }
  const prevPage = el('prevKeyPage');
  const nextPage = el('nextKeyPage');
  if (prevPage) {
    prevPage.disabled = state.keyPage <= 1;
    prevPage.setAttribute(
      'aria-label',
      state.keyPage <= 1
        ? '密钥池上一页不可用。已在第一页，可跳转到指定页码或调整每页数量'
        : ('密钥池上一页。可前往第 ' + fmt(state.keyPage - 1) + ' 页，或跳转到指定页码')
    );
  }
  if (nextPage) {
    nextPage.disabled = state.keyPage >= totalPages;
    nextPage.setAttribute(
      'aria-label',
      state.keyPage >= totalPages
        ? '密钥池下一页不可用。已在最后一页，可跳转到指定页码或调整每页数量'
        : ('密钥池下一页。可前往第 ' + fmt(state.keyPage + 1) + ' 页，或跳转到指定页码')
    );
  }
  if (!rows.length) {
    state.mobileDetailsOpen = false;
    el('keysBody').innerHTML = state.keys.length === 0
      ? '<tr><td colspan="11" class="empty empty-onboarding"><div class="first-run-empty"><div class="empty-kicker" aria-hidden="true">首次配置</div><h3>还没有可调度的 Exa Key</h3><p>导入至少一把上游 Key 后，代理才会开始处理客户端请求。密钥会写入本地状态库，并按当前加密策略保存。</p><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="import" aria-label="打开批量导入密钥。可粘贴或选择文件后预检再提交">批量导入密钥</button><span>支持每行一个 Key 或 <code>id:key:weight</code></span></div></div></td></tr>'
      : '<tr><td colspan="11" class="empty key-empty-cell">' + renderKeyFilteredEmptyState(filter, query) + '</td></tr>';
    setDetailBodies(state.keys.length === 0
      ? renderKeyFirstRunDetailEmpty()
      : renderKeyFilteredDetailEmpty());
    syncMobileDetailsPanel();
    return;
  }
  el('keysBody').innerHTML = pageRows.map((key) => {
    const status = statusOf(key);
    const observedRequests = observedRequestsFor(key);
    const success = pct(key.successCount, observedRequests);
    const selected = key.id === state.selectedId ? ' class="selected"' : '';
    const checked = state.selectedKeyIds.includes(key.id) ? ' checked' : '';
    const keyLabel = displayLabel(key);
    const signal = keyRowSignal(key, status, observedRequests);
    const signalNext = signal.label === '已停用'
      ? '可启用后恢复调度'
      : signal.label === '冷却中'
        ? '可重置冷却后继续观察'
        : signal.label === '429 压力'
          ? '可筛选 429 日志并评估密钥'
          : signal.label === '超时压力' || signal.label === '失败信号'
            ? '可打开详情并测试连通性'
            : signal.label === '待样本'
              ? '可测试密钥或等待请求样本'
              : '可打开详情复核调度状态';
    const signalAria = '密钥 ' + keyLabel + ' 状态信号：' + signal.label + '，' + signal.detail + '。' + signalNext;
    const signalTitle = signal.label + '：' + signal.detail + '。' + signalNext;
    const metricNext = Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0
      ? '可打开详情并测试连通性'
      : observedRequests
        ? '可打开详情复核调度状态'
        : '可测试密钥或等待请求样本';
    return '<tr data-key-id="' + esc(key.id) + '"' + selected + '>' +
      '<td class="col-check"><input type="checkbox" class="key-checkbox" data-key-check="' + esc(key.id) + '" aria-label="选择密钥 ' + esc(keyLabel) + '。勾选后可批量操作"' + checked + '></td>' +
      '<td class="mono" aria-label="密钥 ID：' + esc(keyLabel) + '。可打开详情复核用量与操作">' + esc(keyLabel) + '</td>' +
      '<td><button class="toggle ' + (key.enabled ? 'on' : '') + '" data-action="toggle" aria-label="切换密钥 ' + esc(keyLabel) + ' 启用状态。当前' + (key.enabled ? '已启用，点击禁用' : '已禁用，点击启用') + '" aria-pressed="' + (key.enabled ? 'true' : 'false') + '"></button></td>' +
      '<td class="key-signal-cell"><span class="key-row-signal ' + esc(signal.tone) + '" role="status" aria-label="' + esc(signalAria) + '" title="' + esc(signalTitle) + '"><strong>' + esc(signal.label) + '</strong><small>' + esc(signal.detail) + '</small></span></td>' +
      '<td aria-label="密钥 ' + esc(keyLabel) + ' 请求数：' + fmt(observedRequests) + '。' + metricNext + '">' + fmt(observedRequests) + '</td>' +
      '<td class="good" aria-label="密钥 ' + esc(keyLabel) + ' 成功率：' + success + '。' + metricNext + '">' + success + '</td>' +
      '<td class="bad" aria-label="密钥 ' + esc(keyLabel) + ' 失败数：' + fmt(key.failureCount) + '。' + (Number(key.failureCount || 0) > 0 ? '可打开详情并测试连通性' : '可继续观察调度') + '">' + fmt(key.failureCount) + '</td>' +
      '<td class="warn" aria-label="密钥 ' + esc(keyLabel) + ' 429 次数：' + fmt(key.rateLimitCount) + '。' + (Number(key.rateLimitCount || 0) > 0 ? '可筛选 429 日志并评估密钥' : '可继续观察调度') + '">' + fmt(key.rateLimitCount) + '</td>' +
      '<td aria-label="密钥 ' + esc(keyLabel) + ' 超时次数：' + fmt(key.timeoutCount) + '。' + (Number(key.timeoutCount || 0) > 0 ? '可打开详情并测试连通性' : '可继续观察调度') + '">' + fmt(key.timeoutCount) + '</td>' +
      '<td><span class="badge ' + classForStatus(status) + '" aria-label="密钥 ' + esc(keyLabel) + ' 调度状态：' + esc(status === 'Cooldown' ? ('冷却中，剩余 ' + cooldownLeft(key.cooldownUntil)) : statusText[status]) + '。' + esc(signalNext) + '">' + (status === 'Cooldown' ? cooldownLeft(key.cooldownUntil) : statusText[status]) + '</span></td>' +
      '<td class="action-cell"><button class="mini-btn" data-action="select" title="查看详情，可在侧栏复核用量与操作" aria-label="查看密钥 ' + esc(keyLabel) + ' 详情。可在侧栏复核用量与操作">详情</button><button class="mini-btn" data-action="reset" title="重置冷却，可恢复调度后继续观察" aria-label="重置密钥 ' + esc(keyLabel) + ' 冷却。可恢复调度后继续观察">重置</button><button class="mini-btn primary-mini" data-action="test" title="测试密钥，结果会写入审计并可在详情复核" aria-label="测试密钥 ' + esc(keyLabel) + '。结果会写入审计并可在详情复核">测试</button></td>' +
    '</tr>';
  }).join('');
  renderDetails();
  syncRowFocusIntent();
  syncSelectAllKeysControl();
}

export function showKeyOnCurrentPage(id) {
  if (!id || !state.keys.some((key) => key.id === id)) return false;
  const rows = sortKeyRows(state.keys.slice());
  const index = rows.findIndex((key) => key.id === id);
  if (index < 0) return false;
  state.keyPage = Math.floor(index / state.keyPageSize) + 1;
  return true;
}

function pickDefaultKey() {
  if (state.selectedId && state.keys.some((item) => item.id === state.selectedId)) return state.selectedId;
  const cooling = state.keys.find((item) => statusOf(item) === 'Cooldown');
  return (cooling || state.keys[0])?.id || null;
}

function detailHealthFor(key, status, observedRequests) {
  const failures = Number(key.failureCount || 0);
  const rateLimits = Number(key.rateLimitCount || 0);
  const timeouts = Number(key.timeoutCount || 0);
  if (status === 'Disabled') {
    return { tone: 'bad', title: '已暂停调度', text: '该密钥不会接收新请求。启用前建议先测试上游连通性。' };
  }
  if (status === 'Cooldown') {
    return { tone: 'warn', title: '冷却保护中', text: '调度器正在避开该密钥。优先查看冷却原因与最近失败。' };
  }
  if (failures || rateLimits || timeouts) {
    return { tone: 'warn', title: '存在异常信号', text: '近 24 小时出现失败、429 或超时。建议测试后再放大流量。' };
  }
  if (!observedRequests) {
    return { tone: 'blue', title: '待请求样本', text: '当前可参与调度，但还没有足够请求样本判断稳定性。' };
  }
  return { tone: 'good', title: '可继续调度', text: '当前窗口没有记录失败信号，可保持自动刷新观察趋势。' };
}

function operationFor(key) {
  if (state.lastOperation && state.lastOperation.id === key.id) return state.lastOperation;
  return { id: key.id, tone: 'warn', title: '待操作', message: '暂无本次操作反馈。可测试/重置冷却，或启用/禁用后在此查看结果。', time: '-' };
}

function renderFailureSummary(key) {
  const summary = state.keyFailures[key.id];
  if (!summary) {
    const pendingNext = '可刷新控制台或测试该密钥后复核失败摘要';
    return '<div class="failure-reasons" role="status" aria-live="polite" aria-atomic="true" aria-label="最近失败摘要：待载入。' + pendingNext + '"><div class="reason-row"><span>摘要</span><strong>待载入</strong></div></div>';
  }
  const reasons = Object.entries(summary.reasons || {});
  if (!reasons.length) {
    const emptyNext = '可继续观察调度，或测试密钥确认连通性';
    return '<div class="failure-reasons" role="status" aria-live="polite" aria-atomic="true" aria-label="最近失败摘要：暂无最近失败。' + emptyNext + '"><div class="reason-row"><span>摘要</span><strong>暂无最近失败</strong></div></div>';
  }
  const top = reasons.slice(0, 3).map(([reason, count]) => labelOf(reason) + ' ' + fmt(count) + ' 次').join('，');
  const filledNext = '可打开请求日志按密钥筛选，或重置冷却后重试';
  return '<div class="failure-reasons" role="status" aria-live="polite" aria-atomic="true" aria-label="最近失败摘要：' + esc(top) + '。最近状态 ' + esc(summary.lastStatus || '-') + '。' + filledNext + '">' + reasons.map(([reason, count]) => '<div class="reason-row"><span>' + esc(labelOf(reason)) + '</span><strong>' + fmt(count) + ' 次</strong></div>').join('') +
    '<div class="reason-row"><span>最近状态</span><strong>' + esc(summary.lastStatus || '-') + '</strong></div>' +
    '<div class="reason-row"><span>最近时间</span><strong>' + esc(stamp(summary.lastFailureAt)) + '</strong></div></div>';
}

function setDetailBodies(markup) {
  document.querySelectorAll('.detail-body-target').forEach((body) => { body.innerHTML = markup; });
}

function syncMobileDetailsPanel() {
  const panel = el('mobileDetails');
  if (!panel) return;
  const open = Boolean(state.mobileDetailsOpen);
  panel.classList.toggle('is-open', open);
  panel.setAttribute(
    'aria-label',
    open
      ? '移动端密钥详情已打开。可复核用量与操作，或关闭返回密钥表'
      : '移动端密钥详情。选择密钥后可在此查看'
  );
  const closeBtn = el('closeMobileDetails');
  if (closeBtn) {
    closeBtn.setAttribute(
      'aria-label',
      open
        ? '关闭移动端密钥详情，返回密钥表'
        : '关闭移动端密钥详情'
    );
  }
}

function syncDetailFocusIntent() {
  if (!state.detailFocusAction || Date.now() > Number(state.detailFocusUntil || 0)) return;
  const apply = () => {
    if (!state.detailFocusAction || Date.now() > Number(state.detailFocusUntil || 0)) return;
    const root = window.getComputedStyle(el('mobileDetails')).display === 'none' ? el('detailsBody') : el('mobileDetailsBody');
    const target = root?.querySelector('button[data-detail-action="' + state.detailFocusAction + '"]');
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  };
  // Double rAF covers detail re-render + pending paint; short retry covers a follow-up refresh paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      if (state.detailFocusAction && Date.now() <= Number(state.detailFocusUntil || 0)) {
        setTimeout(apply, 48);
      }
    });
  });
}

function syncRowFocusIntent() {
  if (!state.rowFocusKeyId || !state.rowFocusAction || Date.now() > Number(state.rowFocusUntil || 0)) return;
  const apply = () => {
    if (!state.rowFocusKeyId || !state.rowFocusAction || Date.now() > Number(state.rowFocusUntil || 0)) return;
    const body = el('keysBody');
    if (!body) return;
    const row = Array.from(body.querySelectorAll('tr[data-key-id]')).find((item) => item.dataset.keyId === state.rowFocusKeyId);
    const target = row?.querySelector('button[data-action="' + state.rowFocusAction + '"]');
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  };
  // Double rAF covers tbody rebuild + pending paint; short retry covers a follow-up refresh paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      if (state.rowFocusKeyId && state.rowFocusAction && Date.now() <= Number(state.rowFocusUntil || 0)) {
        setTimeout(apply, 48);
      }
    });
  });
}

function renderDetailMarkup(key) {
  const status = statusOf(key);
  const observedRequests = observedRequestsFor(key);
  const successRate = pct(key.successCount, observedRequests);
  const failureRate = pct(key.failureCount, observedRequests);
  const rateLimitRate = pct(key.rateLimitCount, observedRequests);
  const timeoutRate = pct(key.timeoutCount, observedRequests);
  const toggleAction = key.enabled ? 'disable' : 'enable';
  const toggleLabel = key.enabled ? '禁用密钥' : '启用密钥';
  const toggleClass = key.enabled ? 'danger-btn' : 'primary-btn';
  const cooldownState = status === 'Cooldown' ? '进行中' : '未冷却';
  const cooldownRemaining = cooldownLeft(key.cooldownUntil);
  const cooldownReasonText = labelOf(key.cooldownReason);
  const cooldownNext = status === 'Cooldown'
    ? '可查看最近失败，或重置冷却后恢复调度'
    : '可继续观察调度，或测试密钥确认连通性';
  const cooldownAria = '冷却处理：' + cooldownState + '。原因 ' + cooldownReasonText + '，剩余 ' + cooldownRemaining + '。' + cooldownNext;
  const keyLabel = displayLabel(key);
  const health = detailHealthFor(key, status, observedRequests);
  const schedulingText = key.enabled ? '参与调度' : '不参与调度';
  const incidentNext = key.lastError
    ? '可打开请求日志按密钥筛选，或测试/重置后复核'
    : '可继续观察调度，或测试密钥确认连通性';
  const incidentText = key.lastError
    ? '告警摘要：最近一次失败为 ' + labelOf(key.lastError) + '，状态码 ' + (key.lastStatus || '-') + '。' + incidentNext
    : '告警摘要：未记录最近失败。' + incidentNext;
  const operation = operationFor(key);
  const usageNext = Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0
    ? '可打开请求日志按密钥筛选，或测试连通性'
    : observedRequests
      ? '可继续观察调度，或保持自动刷新查看趋势'
      : '可测试密钥，或等待客户端请求样本';
  const usageAria = '近 24 小时用量：请求 ' + fmt(observedRequests) + '，成功 ' + successRate + '，失败 ' + failureRate + '，429 ' + rateLimitRate + '，超时 ' + timeoutRate + '，延迟 ' + ms(key.lastLatencyMs) + '。' + usageNext;
  const heroStatusNext = status === 'Disabled'
    ? '可启用后恢复调度'
    : status === 'Cooldown'
      ? '可重置冷却后继续观察'
      : '可继续观察调度，或测试密钥';
  const heroStatusAria = '密钥 ' + keyLabel + ' 调度状态：' + statusText[status] + '。' + heroStatusNext;
  const factsNext = key.enabled
    ? '可测试连通性，或打开请求日志复核调度'
    : '可启用后恢复调度，或查看冷却与最近失败';
  const factsAria = '密钥摘要：' + schedulingText + '，权重 ' + fmt(key.weight) + '，ID ' + keyLabel + '。' + factsNext;
  return '<section class="detail-section detail-hero"><div class="key-title"><div class="key-name"><span class="detail-kicker" aria-hidden="true">当前密钥</span><strong class="mono">' + esc(keyLabel) + '</strong></div><span class="badge ' + classForStatus(status) + '" aria-label="' + esc(heroStatusAria) + '">' + esc(statusText[status]) + '</span></div>' +
    '<div class="detail-health ' + esc(health.tone) + '" role="status" aria-live="polite" aria-atomic="true" aria-label="密钥健康：' + esc(health.title) + '。' + esc(health.text) + '"><strong>' + esc(health.title) + '</strong><span>' + esc(health.text) + '</span></div>' +
    '<div class="detail-facts" role="status" aria-live="polite" aria-atomic="true" aria-label="' + esc(factsAria) + '"><span><small>调度</small><strong>' + schedulingText + '</strong></span><span><small>权重</small><strong>' + fmt(key.weight) + '</strong></span><span><small>密钥 ID</small><strong class="mono">' + esc(keyLabel) + '</strong></span></div></section>' +
    '<section class="detail-section detail-usage" role="status" aria-live="polite" aria-atomic="true" aria-label="' + esc(usageAria) + '"><div class="detail-section-head"><h3>近 24 小时</h3><span>请求样本与异常比例</span></div><div class="detail-kpis"><div class="detail-kpi"><span>请求</span><strong>' + fmt(observedRequests) + '</strong></div><div class="detail-kpi"><span>成功率</span><strong class="good">' + successRate + '</strong></div><div class="detail-kpi"><span>失败率</span><strong class="bad">' + failureRate + '</strong></div><div class="detail-kpi"><span>429</span><strong class="warn">' + rateLimitRate + '</strong></div><div class="detail-kpi"><span>超时</span><strong>' + timeoutRate + '</strong></div><div class="detail-kpi"><span>延迟</span><strong>' + ms(key.lastLatencyMs) + '</strong></div></div></section>' +
    '<section class="detail-section detail-diagnostics"><div class="diagnostic-card cooldown-card" role="status" aria-live="polite" aria-atomic="true" aria-label="' + esc(cooldownAria) + '"><h3>冷却处理</h3><div class="detail-row"><span>状态</span><span>' + cooldownState + '</span></div><div class="detail-row"><span>原因</span><span>' + esc(cooldownReasonText) + '</span></div><div class="detail-row"><span>剩余</span><span class="' + classForStatus(status) + '">' + esc(cooldownRemaining) + '</span></div></div>' +
    '<div class="diagnostic-card incident-timeline"><h3>最近失败原因</h3>' + renderFailureSummary(key) + '<div class="ops-alert ' + (key.lastError ? 'bad' : 'good') + '" role="status" aria-live="polite" aria-atomic="true" aria-label="' + esc(incidentText) + '">' + esc(incidentText) + '</div>' +
    '<div class="timeline-item" aria-label="错误码：' + esc(labelOf(key.lastError)) + '。' + (key.lastError ? '可打开请求日志按密钥筛选失败' : '当前无错误码，可继续观察') + '"><span>错误码</span><strong class="' + (key.lastError ? 'bad' : '') + '">' + esc(labelOf(key.lastError)) + '</strong></div>' +
    '<div class="timeline-item" aria-label="状态码：' + esc(key.lastStatus || '-') + '。' + (key.lastError ? '可测试密钥或重置冷却后重试' : '可继续观察调度') + '"><span>状态码</span><strong>' + esc(key.lastStatus || '-') + '</strong></div>' +
    '<div class="timeline-item" aria-label="最近失败时间：' + esc(stamp(key.lastFailureAt)) + '。' + (key.lastFailureAt ? '可对照请求日志时间窗口' : '暂无失败时间，可继续观察') + '"><span>时间</span><strong>' + esc(stamp(key.lastFailureAt)) + '</strong></div></div></section>' +
    '<section class="detail-section operation-feedback ' + esc(operation.tone) + '" role="status" aria-live="polite" aria-atomic="true" aria-label="操作反馈：' + esc(operation.title) + '。' + esc(operation.message) + '"><div class="feedback-title"><div><span class="feedback-kicker" aria-hidden="true">操作反馈</span><h3>' + esc(operation.title) + '</h3></div><span>' + esc(operation.time) + '</span></div><div class="feedback-message">' + esc(operation.message) + '</div></section>' +
    '<section class="detail-section actions detail-actions">'
    + '<button class="primary-btn" data-detail-action="test" aria-label="测试密钥 ' + esc(keyLabel) + '。结果会写入审计并可在详情复核">测试密钥</button>'
    + '<button class="ghost-btn" data-detail-action="logs" aria-label="查看密钥 ' + esc(keyLabel) + ' 的请求日志。可点 requestId 看链路">查看日志</button>'
    + '<button class="ghost-btn" data-detail-action="copy" aria-label="复制密钥 ' + esc(keyLabel) + '。复制会按策略写入审计，可妥善保管后继续操作">复制密钥</button>'
    + '<button class="ghost-btn" data-detail-action="reset" aria-label="重置密钥 ' + esc(keyLabel) + ' 冷却。可恢复调度后继续观察">重置冷却</button>'
    + '<button class="' + toggleClass + '" data-detail-action="' + toggleAction + '" aria-label="' + (key.enabled ? '禁用' : '启用') + '密钥 ' + esc(keyLabel) + '。操作会写入管理员审计，可继续测试或查看日志">' + toggleLabel + '</button>'
    + '</section>';
}

export function renderDetails() {
  if (state.keys.length && state.pageKeyIds.length === 0) {
    setDetailBodies(renderKeyFilteredDetailEmpty());
    syncMobileDetailsPanel();
    return;
  }
  state.selectedId = pickDefaultKey();
  const key = state.keys.find((item) => item.id === state.selectedId);
  if (!key) {
    setDetailBodies(state.keys.length === 0 ? renderKeyFirstRunDetailEmpty() : renderKeyIdleDetailEmpty());
    syncMobileDetailsPanel();
    return;
  }
  setDetailBodies(renderDetailMarkup(key));
  syncMobileDetailsPanel();
  syncDetailFocusIntent();
}
