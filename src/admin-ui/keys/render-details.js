import { classForStatus, cooldownLeft, displayLabel, el, esc, fmt, labelOf, ms, observedRequestsFor, pct, stamp, state, statusOf, statusText } from '../state.js';

export function renderKeyFilteredDetailEmpty() {
  return '<div class="empty key-detail-empty filtered"><div class="empty-kicker" aria-hidden="true">筛选结果</div><h3>当前范围没有可查看密钥</h3><p>清空搜索或状态筛选后，这里会重新显示密钥用量、冷却和最近失败。</p><div class="empty-actions"><button class="ghost-btn" type="button" data-empty-action="clear-filters" aria-label="清除密钥池筛选，恢复全部密钥。可继续搜索 ID 或按状态筛选">清除筛选</button></div></div>';
}

export function renderKeyFirstRunDetailEmpty() {
  return '<div class="empty key-detail-empty first-run"><div class="empty-kicker" aria-hidden="true">首次配置</div><h3>导入密钥后显示详情</h3><p>密钥池为空时，这里会展示选中密钥的用量、冷却、最近失败和操作反馈。先导入至少一把上游 Key。</p><div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="import" aria-label="打开批量导入密钥。可粘贴或选择文件后预检再提交">批量导入密钥</button><span>与表格导入入口相同</span></div></div>';
}

export function renderKeyIdleDetailEmpty() {
  return '<div class="empty key-detail-empty idle">'
    + '<div class="empty-kicker" aria-hidden="true">密钥详情</div>'
    + '<h3>选择一个密钥</h3>'
    + '<p>点左侧行或「详情」查看状态与操作。</p>'
    + '<div class="empty-actions">'
    + '<button class="primary-btn" type="button" data-empty-action="select-first-key" aria-label="查看当前页首个密钥详情。可在侧栏复核用量与操作">查看首个</button>'
    + '<button class="ghost-btn" type="button" data-empty-action="focus-key-search" aria-label="聚焦密钥搜索框。输入后即时收窄列表，可继续按状态筛选">搜索</button>'
    + '</div>'
    + '</div>';
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
  return null;
}

function renderFailureSummary(key) {
  const summary = state.keyFailures[key.id];
  if (!summary) return '';
  const reasons = Object.entries(summary.reasons || {});
  if (!reasons.length && !key.lastError) return '';
  if (!reasons.length) {
    return '<div class="failure-reasons" role="status" aria-live="polite" aria-atomic="true" aria-label="最近失败：' + esc(labelOf(key.lastError)) + '">'
      + '<div class="reason-row"><span>错误</span><strong class="bad">' + esc(labelOf(key.lastError)) + '</strong></div>'
      + '<div class="reason-row"><span>状态</span><strong>' + esc(key.lastStatus || '-') + '</strong></div>'
      + '<div class="reason-row"><span>时间</span><strong>' + esc(stamp(key.lastFailureAt)) + '</strong></div>'
      + '</div>';
  }
  const top = reasons.slice(0, 3).map(([reason, count]) => labelOf(reason) + ' ' + fmt(count) + ' 次').join('，');
  return '<div class="failure-reasons" role="status" aria-live="polite" aria-atomic="true" aria-label="最近失败摘要：' + esc(top) + '">'
    + reasons.slice(0, 4).map(([reason, count]) => '<div class="reason-row"><span>' + esc(labelOf(reason)) + '</span><strong>' + fmt(count) + '</strong></div>').join('')
    + '<div class="reason-row"><span>最近</span><strong>' + esc(stamp(summary.lastFailureAt || key.lastFailureAt)) + '</strong></div>'
    + '</div>';
}

export function setDetailBodies(markup) {
  document.querySelectorAll('.detail-body-target').forEach((body) => { body.innerHTML = markup; });
}

export function syncMobileDetailsPanel() {
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
        ? '关闭移动端密钥详情，返回密钥表。可继续点选密钥或批量操作'
        : '关闭移动端密钥详情。可点选密钥后打开详情'
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

export function syncRowFocusIntent() {
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
  const toggleLabel = key.enabled ? '禁用' : '启用';
  const toggleClass = key.enabled ? 'danger-btn' : 'primary-btn';
  const cooldownRemaining = cooldownLeft(key.cooldownUntil);
  const cooldownReasonText = labelOf(key.cooldownReason);
  const keyLabel = displayLabel(key);
  const health = detailHealthFor(key, status, observedRequests);
  const operation = operationFor(key);
  const hasAnomaly = Boolean(key.lastError) || Number(key.failureCount || 0) > 0 || Number(key.rateLimitCount || 0) > 0 || Number(key.timeoutCount || 0) > 0 || status === 'Cooling' || status === 'Disabled';
  const failureBlock = renderFailureSummary(key);
  const heroStatusNext = status === 'Disabled'
    ? '可启用后恢复调度'
    : status === 'Cooling'
      ? '可重置冷却后继续观察'
      : '可继续观察调度，或测试密钥';
  const heroStatusAria = '密钥 ' + keyLabel + ' 调度状态：' + statusText[status] + '。' + heroStatusNext;
  const usageAria = '近 24 小时：请求 ' + fmt(observedRequests) + '，成功 ' + successRate + '，失败 ' + failureRate;

  const usageKpis = hasAnomaly || observedRequests
    ? '<div class="detail-kpis detail-kpis-compact">'
      + '<div class="detail-kpi"><span>请求</span><strong>' + fmt(observedRequests) + '</strong></div>'
      + '<div class="detail-kpi"><span>成功</span><strong class="good">' + successRate + '</strong></div>'
      + (hasAnomaly
        ? '<div class="detail-kpi"><span>失败</span><strong class="bad">' + failureRate + '</strong></div>'
          + '<div class="detail-kpi"><span>429</span><strong class="warn">' + rateLimitRate + '</strong></div>'
          + '<div class="detail-kpi"><span>超时</span><strong>' + timeoutRate + '</strong></div>'
          + '<div class="detail-kpi"><span>延迟</span><strong>' + ms(key.lastLatencyMs) + '</strong></div>'
        : '<div class="detail-kpi"><span>延迟</span><strong>' + ms(key.lastLatencyMs) + '</strong></div>')
      + '</div>'
    : '<p class="detail-quiet-note">尚无请求样本 · 权重 ' + fmt(key.weight) + '</p>';

  const cooldownSection = status === 'Cooling'
    ? '<section class="detail-section detail-cooldown" role="status" aria-live="polite" aria-atomic="true" aria-label="冷却中：' + esc(cooldownReasonText) + '，剩余 ' + esc(cooldownRemaining) + '">'
      + '<div class="detail-section-head"><h3>冷却中</h3><span class="badge warn">' + esc(cooldownRemaining) + '</span></div>'
      + '<p class="detail-quiet-note">' + esc(cooldownReasonText === '-' ? '保护冷却' : cooldownReasonText) + '</p>'
      + '</section>'
    : '';

  const failureSection = failureBlock
    ? '<section class="detail-section detail-failures"><div class="detail-section-head"><h3>最近失败</h3></div>' + failureBlock + '</section>'
    : '';

  const operationSection = operation
    ? '<section class="detail-section operation-feedback ' + esc(operation.tone) + '" role="status" aria-live="polite" aria-atomic="true" aria-label="操作反馈：' + esc(operation.title) + '。' + esc(operation.message) + '">'
      + '<div class="feedback-title"><div><span class="feedback-kicker" aria-hidden="true">刚才</span><h3>' + esc(operation.title) + '</h3></div><span>' + esc(operation.time) + '</span></div>'
      + '<div class="feedback-message">' + esc(operation.message) + '</div></section>'
    : '';

  return '<section class="detail-section detail-hero">'
    + '<div class="key-title"><div class="key-name"><span class="detail-kicker" aria-hidden="true">密钥</span><strong class="mono">' + esc(keyLabel) + '</strong></div>'
    + '<span class="badge ' + classForStatus(status) + '" aria-label="' + esc(heroStatusAria) + '">' + esc(statusText[status]) + '</span></div>'
    + '<div class="detail-health ' + esc(health.tone) + '" role="status" aria-live="polite" aria-atomic="true" aria-label="密钥健康：' + esc(health.title) + '。' + esc(health.text) + '">'
    + '<strong>' + esc(health.title) + '</strong><span>' + esc(health.text) + '</span></div>'
    + '</section>'
    + '<section class="detail-section actions detail-actions detail-actions-primary">'
    + '<button class="primary-btn" data-detail-action="test" aria-label="测试密钥 ' + esc(keyLabel) + '。结果会写入审计并可在详情复核">测试密钥</button>'
    + '<button class="ghost-btn" data-detail-action="logs" aria-label="查看密钥 ' + esc(keyLabel) + ' 的请求日志。可点 requestId 看链路">查看日志</button>'
    + '<button class="ghost-btn" data-detail-action="copy" aria-label="复制密钥 ' + esc(keyLabel) + '。复制会按策略写入审计，可妥善保管后继续操作">复制密钥</button>'
    + '<button class="ghost-btn' + (status === 'Cooling' ? '' : ' is-quiet') + '" data-detail-action="reset" aria-label="重置密钥 ' + esc(keyLabel) + ' 冷却。可恢复调度后继续观察"' + (status === 'Cooling' ? '' : ' hidden') + '>重置冷却</button>'
    + '<button class="' + toggleClass + '" data-detail-action="' + toggleAction + '" aria-label="' + (key.enabled ? '禁用' : '启用') + '密钥 ' + esc(keyLabel) + '。操作会写入管理员审计，可继续测试或查看日志">' + (key.enabled ? '禁用密钥' : '启用密钥') + '</button>'
    + '</section>'
    + '<section class="detail-section detail-usage" role="status" aria-live="polite" aria-atomic="true" aria-label="' + esc(usageAria) + '">'
    + '<div class="detail-section-head"><h3>用量</h3><span>24h</span></div>'
    + usageKpis
    + '</section>'
    + cooldownSection
    + failureSection
    + operationSection;
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
