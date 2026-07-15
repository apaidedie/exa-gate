import { el, esc, fmt, pct, stamp, state } from '../state.js';
import { AUDIT_LIST_WINDOW, filterChipMarkup } from '../logs/render-shared.js';

const auditActionLabels = {
  admin_https_required: '管理访问要求 HTTPS',
  alert_webhook: '发送告警 Webhook',
  auto_prune_logs: '自动清理过期日志',
  batch_disable: '批量禁用密钥',
  batch_enable: '批量启用密钥',
  batch_reset: '批量重置冷却',
  batch_test: '批量测试密钥',
  batch_unknown: '批量操作',
  create_key: '创建密钥',
  delete_key: '删除密钥',
  disable_key: '禁用密钥',
  enable_key: '启用密钥',
  export_audit: '导出审计记录',
  export_logs: '导出请求日志',
  import_keys: '批量导入密钥',
  login: '管理员登录',
  logout: '管理员退出登录',
  prune_logs: '清理请求日志',
  reset_circuit: '重置密钥冷却',
  reveal_key_secret: '查看原始密钥',
  test_alert_webhook: '测试告警 Webhook',
  test_key: '测试密钥',
  update_key: '更新密钥'
};

function auditActionLabel(action) {
  const key = String(action || '').trim();
  if (!key) return '未知审计操作';
  if (auditActionLabels[key]) return auditActionLabels[key];
  if (key.startsWith('batch_')) return '批量操作';
  return key.replace(/_/g, ' ');
}

function auditOutcomeLabel(value) {
  return { success: '成功', failure: '失败' }[value] || value;
}

function auditFilterState() {
  const query = el('auditSearch')?.value?.trim() || '';
  const action = el('auditActionFilter')?.value || '';
  const outcome = el('auditOutcomeFilter')?.value || '';
  const filters = [];
  if (query) filters.push({ key: 'query', label: '关键词', value: query });
  if (action) filters.push({ key: 'action', label: '动作', value: auditActionLabel(action) });
  if (outcome) filters.push({ key: 'outcome', label: '结果', value: auditOutcomeLabel(outcome) });
  return { query, action, outcome, filters, active: filters.length > 0 };
}

function auditSearchText(item) {
  const rawAction = String(item?.action || '');
  return [
    auditActionLabel(rawAction),
    rawAction,
    item?.actorTokenId,
    item?.targetId,
    item?.detail,
    item?.ip,
    item?.userAgent,
    stamp(item?.createdAt)
  ].map((value) => String(value ?? '').toLowerCase()).join(' ');
}

function filterAuditRows(rows, filters) {
  const query = filters.query.toLowerCase();
  return rows.filter((item) => {
    if (filters.action && String(item?.action || '') !== filters.action) return false;
    if (filters.outcome === 'success' && !item?.success) return false;
    if (filters.outcome === 'failure' && item?.success) return false;
    if (query && !auditSearchText(item).includes(query)) return false;
    return true;
  });
}

function renderAuditFilterSummary(filters, visibleCount) {
  const summary = el('auditFilterSummary');
  if (!summary) return;
  const chips = el('auditFilterChips');
  const text = el('auditFilterSummaryText');
  const clearButton = el('clearAuditFilters');
  const summaryText = filters.active
    ? '匹配 ' + fmt(visibleCount) + ' 条 · 窗口最近 ' + fmt(AUDIT_LIST_WINDOW) + ' 条 · 导出沿用动作/结果'
    : '最近 ' + fmt(AUDIT_LIST_WINDOW) + ' 条审计 · 可按关键词/动作/结果收窄';
  const summaryNext = filters.active
    ? (visibleCount ? '可导出证据或清除筛选' : '可清除筛选或调整动作/结果')
    : '可搜索关键词或按动作/结果筛选';
  summary.classList.toggle('is-empty', !filters.active);
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  summary.setAttribute('aria-label', '审计筛选状态：' + summaryText + '。' + summaryNext);
  if (text) text.textContent = summaryText;
  if (chips) {
    chips.innerHTML = filters.active
      ? filters.filters.map((filter) => filterChipMarkup('audit', filter)).join('')
      : '<span class="audit-filter-chip is-muted">未筛选</span>';
  }
  if (clearButton) clearButton.hidden = !filters.active;
}

function setAuditStatus(id, text, labelPrefix, nextAction = '') {
  const target = el(id);
  if (!target) return;
  const value = String(text ?? '');
  const next = String(nextAction || '').trim();
  target.textContent = value;
  target.setAttribute('role', 'status');
  target.setAttribute('aria-live', 'polite');
  target.setAttribute('aria-atomic', 'true');
  target.setAttribute('aria-label', labelPrefix + '：' + value + (next ? '。' + next : ''));
}

function renderAuditSummary(rows) {
  const total = rows.length;
  const success = rows.filter((item) => item.success).length;
  const failure = total - success;
  const latest = rows[0] || null;
  const latestAction = latest ? auditActionLabel(latest.action) : '暂无审计';
  const latestTime = latest ? stamp(latest.createdAt) : '刷新后显示最近管理员动作';
  const latestText = total ? latestAction + ' · ' + latestTime : latestAction;
  setAuditStatus('auditTotal', fmt(total), '审计总记录', total ? '可搜索动作/密钥 ID 或导出证据' : '可刷新审计或到密钥池生成证据');
  setAuditStatus('auditSuccess', fmt(success), '审计成功', success ? '可按结果筛选成功记录' : '完成管理操作后会出现成功记录');
  setAuditStatus('auditFailure', fmt(failure), '审计失败', failure ? '可筛选失败记录并复核' : '当前无失败审计，可继续观察或刷新列表');
  setAuditStatus('auditLatest', latestText, '最新审计', latest ? '可按最新线索搜索审计' : '可刷新列表等待新动作');
}

function renderAuditEvidence(rows, filters = { active: false }) {
  const total = rows.length;
  const failures = rows.filter((item) => !item.success).length;
  const latest = rows[0] || null;
  const latestAction = latest ? auditActionLabel(latest.action) : '暂无动作';
  const latestActor = latest?.actorTokenId || '-';
  const latestSearch = latest ? (latest.actorTokenId || latest.action || latestAction) : '';
  const exportReady = total > 0;
  const totalText = fmt(total);
  const failureText = fmt(failures);
  const failureRateText = pct(failures, total);
  const windowText = total
    ? (filters.active
      ? '窗口内匹配 ' + fmt(total) + ' 条'
      : '最近窗口 ' + fmt(total) + ' / 最多 ' + fmt(AUDIT_LIST_WINDOW) + ' 条')
    : (filters.active ? '当前筛选无命中' : '刷新后显示最近窗口');
  const actionText = latest ? latestAction + ' · ' + stamp(latest.createdAt) : latestAction;
  const exportText = exportReady ? '可导出' : '待生成';
  const exportHintText = exportReady ? (filters.action || filters.outcome ? '导出沿用动作与结果筛选' : '导出当前审计 CSV 证据') : '暂无可导出审计记录';
  const failureEl = el('auditEvidenceFailures');
  const exportEl = el('auditEvidenceExport');
  const resetAction = filters.active ? '清除审计筛选，恢复最近管理员审计' : (total ? '聚焦审计搜索，查看最近管理员审计' : '可刷新列表或到密钥池生成证据');
  const failureAction = failures ? '筛选失败审计记录并复核' : '当前证据范围没有失败审计，可继续观察或刷新列表';
  const latestActionHint = latestSearch ? '按最新线索搜索审计并收窄范围' : '暂无最新审计线索，完成管理操作后再试或打开密钥池';
  const exportAction = exportReady ? '导出当前审计证据 CSV' : '暂无可导出审计记录，可刷新列表或到密钥池生成证据';
  setAuditStatus('auditEvidenceTotal', totalText, '已载入证据', total ? resetAction : '可刷新列表或到密钥池生成证据');
  setAuditStatus('auditEvidenceWindow', windowText, '审计窗口', total ? resetAction : (filters.active ? '可清除筛选恢复最近审计' : '可刷新列表等待新动作'));
  if (failureEl) {
    failureEl.className = failures ? 'bad' : 'good';
  }
  setAuditStatus('auditEvidenceFailures', failureText, '失败审计', failures ? failureAction : '当前无失败审计，可继续观察或刷新列表');
  setAuditStatus('auditEvidenceFailureRate', failureRateText, '失败率', failures ? failureAction : '当前无失败审计，可继续观察或刷新列表');
  setAuditStatus('auditEvidenceActor', latestActor, '最新操作者', latestSearch ? latestActionHint : '完成管理操作后再试或打开密钥池');
  setAuditStatus('auditEvidenceAction', actionText, '最新动作', latestSearch ? latestActionHint : '完成管理操作后再试或打开密钥池');
  if (exportEl) {
    exportEl.className = exportReady ? 'good' : 'warn';
  }
  setAuditStatus('auditEvidenceExport', exportText, '导出状态', exportAction);
  setAuditStatus('auditEvidenceExportHint', exportHintText, '导出提示', exportAction);
  syncAuditEvidenceAction('reset', false, '已载入证据：' + totalText + '，' + windowText + '。' + resetAction);
  syncAuditEvidenceAction('failures', failures === 0, '失败审计：' + failureText + '，' + failureRateText + '。' + failureAction);
  syncAuditEvidenceAction('latest', !latestSearch, '最新线索：' + latestActor + '，' + actionText + '。' + latestActionHint);
  syncAuditEvidenceAction('export', !exportReady, '导出状态：' + exportText + '，' + exportHintText + '。' + exportAction);
  const latestActionEl = document.querySelector('[data-audit-evidence-action="latest"]');
  if (latestActionEl) latestActionEl.dataset.auditEvidenceValue = latestSearch;
}

function syncAuditEvidenceAction(action, disabled, label) {
  const button = document.querySelector('[data-audit-evidence-action="' + action + '"]');
  if (!button) return;
  button.disabled = disabled;
  button.setAttribute('aria-label', label);
  button.title = label;
}

function renderAuditEmptyState(kind = 'empty') {
  const isFiltered = kind === 'filtered';
  const title = isFiltered ? '没有匹配的审计记录' : '暂无审计记录';
  const message = isFiltered
    ? '当前筛选条件没有命中记录。可清除关键词、动作或结果筛选，或刷新列表后恢复最近审计证据。'
    : '管理员登录、导出、密钥操作和日志治理动作会在这里形成可导出的证据链。可先刷新窗口，或到密钥池完成一次导入/测试后回来查看。';
  const chips = isFiltered ? ['清除筛选', '刷新列表', '调整条件'] : ['刷新审计', '密钥动作', '导出证据'];
  const actions = isFiltered
    ? '<div class="empty-actions"><button class="primary-btn" type="button" data-empty-action="clear-audit-filters" aria-label="清除管理员审计筛选，恢复最近证据。可继续按动作/结果筛选或导出">清除筛选</button><button class="ghost-btn" type="button" data-empty-action="refresh-audit" aria-label="刷新审计列表，重新载入最近窗口。可继续筛选证据或到密钥池生成动作">刷新列表</button><span>恢复最近管理员审计</span></div>'
    : '<div class="empty-actions">'
      + '<button class="primary-btn" type="button" data-empty-action="refresh-audit" aria-label="刷新审计列表，重新载入最近窗口。可继续筛选证据或到密钥池生成动作">刷新列表</button>'
      + '<button class="ghost-btn" type="button" data-empty-action="open-keys" aria-label="打开密钥池生成新的管理证据。可导入/测试后回到审计复核">打开密钥池</button>'
      + '<span>重新载入或生成新的管理证据</span>'
      + '</div>';
  return '<div class="audit-empty-state ' + esc(kind) + '"><div class="empty-kicker" aria-hidden="true">管理员审计</div><h3>' + esc(title) + '</h3><p>' + esc(message) + '</p><div class="trace-empty-steps">' + chips.map((chip) => '<span>' + esc(chip) + '</span>').join('') + '</div>' + actions + '</div>';
}

export function renderAudit() {
  const filters = auditFilterState();
  const sourceRows = state.audit || [];
  const rows = filterAuditRows(sourceRows, filters);
  renderAuditSummary(rows);
  renderAuditEvidence(rows, filters);
  renderAuditFilterSummary(filters, rows.length);
  const countEl = el('auditCount');
  if (countEl) {
    const auditCountText = filters.active
      ? '显示 ' + fmt(rows.length) + ' / 窗口 ' + fmt(sourceRows.length) + ' 条'
      : '最近窗口 ' + fmt(sourceRows.length) + ' 条';
    const auditCountNext = filters.active
      ? (rows.length ? '可复核条目或清除筛选' : '可清除筛选或刷新审计窗口')
      : (sourceRows.length ? '可搜索动作/密钥 ID 或导出证据' : '可刷新审计或到密钥池生成证据');
    countEl.textContent = auditCountText;
    countEl.setAttribute('role', 'status');
    countEl.setAttribute('aria-live', 'polite');
    countEl.setAttribute('aria-atomic', 'true');
    countEl.setAttribute('aria-label', '管理员审计：' + auditCountText + (filters.active ? '（筛选中）' : '') + '。' + auditCountNext);
  }
  const pager = el('auditPager');
  if (pager) {
    const auditPagerText = filters.active
      ? '当前显示 ' + fmt(rows.length) + ' 条 · 窗口已载入 ' + fmt(sourceRows.length) + ' 条'
      : '当前显示 ' + fmt(rows.length) + ' 条 · 最近窗口最多 ' + fmt(AUDIT_LIST_WINDOW) + ' 条';
    const auditPagerNext = filters.active
      ? '匹配来自最近窗口，非分页'
      : '最近载入窗口，非分页，可刷新扩展证据';
    pager.textContent = auditPagerText;
    pager.setAttribute('role', 'status');
    pager.setAttribute('aria-live', 'polite');
    pager.setAttribute('aria-atomic', 'true');
    pager.setAttribute('aria-label', '审计分页：' + auditPagerText + (filters.active ? '（筛选中）' : '') + '。' + auditPagerNext);
  }
  const pagerHint = el('auditPagerHint');
  if (pagerHint) {
    pagerHint.textContent = filters.active
      ? '匹配筛选 · 来自最近窗口 · 非分页'
      : '最近载入窗口 · 最多 ' + fmt(AUDIT_LIST_WINDOW) + ' 条 · 非分页';
  }
  el('auditList').innerHTML = rows.length ? rows.map((item) => {
    const rawAction = String(item.action || 'unknown_action');
    const label = auditActionLabel(rawAction);
    const tone = item.success ? 'good' : 'bad';
    const outcomeText = item.success ? '成功' : '失败';
    const outcomeNext = item.success
      ? '可继续复核其他证据，或导出当前审计 CSV'
      : '可对照详情排查失败原因，或筛选失败结果';
    const itemAria = '审计：' + label + '，结果 ' + outcomeText + '。目标 ' + (item.targetId || '-') + '。' + outcomeNext;
    return '<div class="audit-item ' + tone + '" role="article" aria-label="' + esc(itemAria) + '"><div class="audit-title"><span class="audit-action"><span>' + esc(label) + '</span><code class="audit-action-code">' + esc(rawAction) + '</code></span><span class="badge ' + tone + '" aria-hidden="true">' + outcomeText + '</span></div><div class="audit-meta-grid"><span><strong>时间</strong>' + esc(stamp(item.createdAt)) + '</span><span><strong>操作者</strong>' + esc(item.actorTokenId || '-') + '</span><span><strong>目标</strong>' + esc(item.targetId || '-') + '</span></div><div class="audit-detail">' + esc(item.detail || item.ip || '无附加详情') + '</div></div>';
  }).join('') : renderAuditEmptyState(filters.active || sourceRows.length ? 'filtered' : 'empty');
}
