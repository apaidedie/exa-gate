import { el, fmt, stamp, state } from '../state.js';

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
  const hintText = String(hint || '').trim();
  const framed = label + '：' + statusText;
  const nextAction = tone === 'warn'
    ? '点击查看配置详情并对照上线建议'
    : '点击查看配置详情并继续观察';
  if (valueEl) {
    valueEl.className = tone || '';
    valueEl.textContent = statusText;
    valueEl.setAttribute('role', 'status');
    valueEl.setAttribute('aria-live', 'polite');
    valueEl.setAttribute('aria-atomic', 'true');
    valueEl.setAttribute('aria-label', framed + (hintText ? '。' + hintText : '') + '。' + nextAction);
    const button = valueEl.closest('button.config-evidence-item');
    if (button) {
      button.setAttribute('aria-label', framed + (hintText ? '。' + hintText : '') + '。' + nextAction);
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
  const hintText = String(hint || '').trim();
  const nextAction = tone === 'good'
    ? '可继续观察，或到配置详情复核'
    : tone === 'warn'
      ? '上线前建议核对，可到配置详情处理'
      : '请关注并复核配置详情';
  const framed = label + '：' + statusText + (hintText ? '。' + hintText : '') + '。' + nextAction;
  if (card) {
    card.className = 'readiness-check ' + (tone || '');
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-atomic', 'true');
    card.setAttribute('aria-label', framed);
  }
  if (valueEl) {
    valueEl.textContent = statusText;
    valueEl.setAttribute('role', 'status');
    valueEl.setAttribute('aria-live', 'polite');
    valueEl.setAttribute('aria-atomic', 'true');
    valueEl.setAttribute('aria-label', framed);
  }
  if (hintEl) hintEl.textContent = hint;
}

function setGovernanceStatus(id, value, label, tone = '') {
  const target = el(id);
  if (!target) return;
  const statusText = String(value || '').trim() || '-';
  const nextAction = tone === 'good'
    ? '可继续观察，或到配置详情复核'
    : tone === 'warn'
      ? '建议点击配置详情对照上线建议复核'
      : tone === 'bad'
        ? '请尽快到配置详情处理'
        : '可到配置详情查看并继续观察';
  target.textContent = statusText;
  if (tone) target.className = tone;
  target.setAttribute('role', 'status');
  target.setAttribute('aria-live', 'polite');
  target.setAttribute('aria-atomic', 'true');
  target.setAttribute('aria-label', label + '：' + statusText + '。' + nextAction);
}

function setConfigItemAria(valueId, label, value, nextAction) {
  const valueEl = el(valueId);
  if (!valueEl) return;
  const item = valueEl.closest('.config-item') || valueEl;
  const statusText = String(value || '').trim() || '-';
  const next = String(nextAction || '').trim() || '可继续观察，或刷新控制台复核';
  item.setAttribute('aria-label', label + '：' + statusText + '。' + next);
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
  setConfigItemAria('retentionDays', '日志保留', daysText + ' · ' + summaryText, days > 0 ? '可继续观察保留窗口与过期日志' : '上线前建议设置保留天数，可到配置详情复核');
  setConfigItemAria('retentionExpired', '过期日志', expiredText + ' · ' + windowText, expired > 0 ? '可清理过期日志，或复核保留策略' : '可继续观察，或刷新控制台复核保留窗口');
  setGovernanceStatus('governanceRetention', daysText, '日志保留', days > 0 ? 'good' : 'warn');
  setGovernanceStatus('governanceExpired', expiredText, '过期日志', expired > 0 ? 'warn' : 'good');
  setGovernanceStatus('governanceRetentionWindow', retentionWindowText, '保留窗口', total ? 'good' : 'warn');
  setReadinessCheck('readinessRetention', days > 0 ? 'good' : 'warn', days > 0 ? '已设置 ' + daysText : '未启用自动清理', days > 0 ? '过期日志 ' + expiredText + '，保留窗口可用于排障' : '上线前建议设置 EXA_LOG_RETENTION_DAYS');
}

export function renderConfigSummary() {
  const config = state.config || {};
  const strategyMap = { round_robin: '轮询', weighted_round_robin: '加权轮询', least_recently_used: '最少最近使用', adaptive_weighted: '自适应加权' };
  const listenText = config.listen || '-';
  const upstreamText = config.upstream || '-';
  const strategyText = strategyMap[config.selectionStrategy] || config.selectionStrategy || '-';
  const listenEl = el('configListen'); if (listenEl) listenEl.textContent = listenText;
  const upstreamEl = el('configUpstream'); if (upstreamEl) upstreamEl.textContent = upstreamText;
  const strategyEl = el('configStrategy'); if (strategyEl) strategyEl.textContent = strategyText;
  const pathsEl = el('configAllowedPaths');
  const allowed = config.allowedPaths || {};
  const pathDetail = allowed.count ? '允许 ' + fmt(allowed.count) + ' 条路径：' + (allowed.preview || []).join('、') : '路径策略未载入';
  if (pathsEl) pathsEl.textContent = pathDetail;
  const stateEl = el('configState'); if (stateEl) stateEl.textContent = config.state?.backend === 'sqlite' ? 'SQLite 持久化' : (config.state?.backend || '-');
  const affinityEl = el('configAffinity'); if (affinityEl) affinityEl.textContent = config.resourceAffinity ? '已启用资源亲和，后续资源请求优先使用创建密钥。' : '未启用资源亲和。';
  const rawKeyText = config.rawKeyDisplayAllowed ? '允许按审计复制原始密钥' : '默认脱敏展示';
  const httpsText = config.adminRequireHttps ? '要求 HTTPS 管理访问' : '未强制 HTTPS';
  const ttlText = config.adminSessionTtlSeconds ? '会话有效期 ' + fmt(Math.round(config.adminSessionTtlSeconds / 3600)) + ' 小时。' : '会话策略未载入';
  const pathText = allowed.count ? '允许 ' + fmt(allowed.count) + ' 条路径' : '路径策略未载入';
  const stateText = config.state?.backend === 'sqlite' ? 'SQLite 持久化' : (config.state?.backend || '未载入');
  const affinityText = config.resourceAffinity ? '已启用资源亲和' : '未启用资源亲和';
  const rawKeyEl = el('configRawKey'); if (rawKeyEl) rawKeyEl.textContent = rawKeyText;
  const httpsEl = el('configAdminHttps'); if (httpsEl) httpsEl.textContent = httpsText;
  const ttlEl = el('configSessionTtl'); if (ttlEl) ttlEl.textContent = ttlText;
  setConfigItemAria('configListen', '监听地址', listenText, listenText !== '-' ? '可对照部署绑定地址继续观察' : '可刷新控制台后复核绑定地址');
  setConfigItemAria('configUpstream', '上游服务', upstreamText, upstreamText !== '-' ? '可对照上游端点继续观察' : '可刷新控制台后复核上游端点');
  setConfigItemAria('configDetailPaths', '调度策略与路径', strategyText + ' · ' + pathDetail, allowed.count ? '可继续观察路径策略，或点击配置证据复核' : '可点击配置证据中的路径策略后在此复核');
  setConfigItemAria('configDetailState', '状态存储', stateText + ' · ' + affinityText, config.state?.backend === 'sqlite' ? '可继续观察持久化边界，或点击配置证据复核' : '可点击配置证据中的状态存储后在此复核');
  setConfigItemAria('configDetailRawKey', '密钥安全', rawKeyText, config.rawKeyDisplayAllowed ? '上线建议关闭原文复制，可点击配置证据复核' : '可继续观察脱敏策略，或点击配置证据复核');
  setConfigItemAria('configDetailHttps', '登录保护', httpsText + ' · ' + ttlText, config.adminRequireHttps ? '可继续观察会话策略，或点击配置证据复核' : '可点击配置证据中的 HTTPS 管理后在此复核');
  setEvidenceCell('configEvidenceHttps', config.adminRequireHttps ? 'good' : 'warn', httpsText, config.adminRequireHttps ? '管理接口要求安全传输' : '本地或反代层需补足 HTTPS');
  setEvidenceCell('configEvidenceRawKey', config.rawKeyDisplayAllowed ? 'warn' : 'good', rawKeyText, config.rawKeyDisplayAllowed ? '复制会写入管理员审计' : '默认隐藏上游密钥原文');
  setEvidenceCell('configEvidencePaths', allowed.count ? 'good' : 'warn', pathText, allowed.count ? (allowed.preview || []).join('、') : '未收到允许路径摘要');
  setEvidenceCell('configEvidenceState', config.state?.backend === 'sqlite' ? 'good' : 'warn', stateText, config.resourceAffinity ? '资源亲和已启用' : '资源亲和未启用');
  setReadinessCheck('readinessHttps', config.adminRequireHttps ? 'good' : 'warn', config.adminRequireHttps ? '已强制 HTTPS' : '需确认 HTTPS', config.adminRequireHttps ? '管理入口拒绝非安全请求' : '本地调试可用，上线需由反代或配置补足');
  setReadinessCheck('readinessRawKey', config.rawKeyDisplayAllowed ? 'warn' : 'good', config.rawKeyDisplayAllowed ? '允许显示原文' : '默认脱敏', config.rawKeyDisplayAllowed ? '上线建议关闭，仅在审计下临时复制' : '上游密钥不会默认暴露在界面');
  setReadinessCheck('readinessState', config.state?.backend === 'sqlite' ? 'good' : 'warn', stateText, config.state?.backend === 'sqlite' ? '密钥状态与审计写入本地状态库' : '请确认容器重启后的状态保存策略');
  setGovernanceStatus('governanceHttps', httpsText, '安全 HTTPS', config.adminRequireHttps ? 'good' : 'warn');
  setGovernanceStatus('governanceRawKey', rawKeyText, '原始密钥策略', config.rawKeyDisplayAllowed ? 'warn' : 'good');
  setGovernanceStatus('governanceSession', ttlText, '会话策略', config.adminSessionTtlSeconds ? 'good' : 'warn');
  setGovernanceStatus('governancePathPolicy', pathText, '路径策略', allowed.count ? 'good' : 'warn');
}

