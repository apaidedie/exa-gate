import { currentRangeHours, el, internalKeyIdFromFilter, loginToken, token } from './state.js';

export function storedSession() {
  const raw = localStorage.getItem('exaProxyAdminSession') || sessionStorage.getItem('exaProxyAdminSession') || '';
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session.id || Number(session.expiresAt || 0) <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function currentSessionId() {
  return storedSession()?.id || '';
}

export function persistToken(value) {
  token.value = value;
  loginToken.value = value;
  sessionStorage.setItem('exaProxyAdminToken', value);
}

export function persistSession(session) {
  const stored = JSON.stringify({ id: session.sessionId || session.id, expiresAt: session.expiresAt, tokenId: session.tokenId });
  localStorage.setItem('exaProxyAdminSession', stored);
  sessionStorage.setItem('exaProxyAdminSession', stored);
  sessionStorage.removeItem('exaProxyAdminToken');
  localStorage.removeItem('exaProxyAdminToken');
  token.value = '';
}

export function clearToken() {
  token.value = '';
  loginToken.value = '';
  sessionStorage.removeItem('exaProxyAdminToken');
  localStorage.removeItem('exaProxyAdminToken');
  sessionStorage.removeItem('exaProxyAdminSession');
  localStorage.removeItem('exaProxyAdminSession');
}

export function adminHeaders(extra = {}) {
  const headers = { ...extra };
  const sessionId = currentSessionId();
  if (sessionId) headers['x-admin-session-id'] = sessionId;
  if (token.value) headers.authorization = 'Bearer ' + token.value;
  return headers;
}

function extractErrorMessage(response, body) {
  if (!body) return response.statusText || ('HTTP ' + response.status);
  try {
    const json = JSON.parse(body);
    return json.message || json.error || body;
  } catch {
    if (body.trimStart().startsWith('<')) {
      const match = body.match(/<title>([^<]+)<\/title>/i);
      if (match) return match[1].trim();
      return response.statusText || ('HTTP ' + response.status);
    }
    return body.length > 120 ? body.slice(0, 117) + '...' : body;
  }
}

export async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: adminHeaders(options.headers || {}) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(extractErrorMessage(response, body));
  }
  return response.json();
}

export async function verifyAdminToken(value) {
  const response = await fetch('/_proxy/session', { method: 'POST', headers: { authorization: 'Bearer ' + value, 'content-type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error(response.status === 423 ? '登录失败次数过多，请稍后再试。' : '管理员令牌无效，请检查后重试。');
  const session = await response.json();
  persistSession(session);
  return session;
}

export async function verifyStoredSession() {
  const response = await fetch('/_proxy/health', { headers: adminHeaders() });
  if (!response.ok) throw new Error('登录已过期，请重新输入管理员令牌。');
  return response.json();
}

function logQueryParams(limit = 100) {
  const params = new URLSearchParams({ limit: String(limit) });
  const pathValue = el('logPathFilter')?.value?.trim();
  const statusValue = el('logStatusFilter')?.value || '';
  const keyValue = internalKeyIdFromFilter(el('logKeyFilter')?.value || '');
  const from = Date.now() - currentRangeHours() * 60 * 60 * 1000;
  if (pathValue) params.set('path', pathValue);
  if (statusValue) params.set('status', statusValue);
  if (keyValue) params.set('keyId', keyValue);
  params.set('from', String(from));
  return params;
}

function auditQueryParams(limit = 5000) {
  const params = new URLSearchParams({ limit: String(limit) });
  const actionValue = el('auditActionFilter')?.value || '';
  const outcomeValue = el('auditOutcomeFilter')?.value || '';
  if (actionValue) params.set('action', actionValue);
  if (outcomeValue === 'success') params.set('success', 'true');
  if (outcomeValue === 'failure') params.set('success', 'false');
  return params;
}

export async function fetchLogs(limit = 100) {
  return api('/_proxy/logs?' + logQueryParams(limit).toString());
}

export async function fetchObservability() {
  return api('/_proxy/observability?hours=' + encodeURIComponent(currentRangeHours()));
}

export async function fetchConfigSummary() {
  return api('/_proxy/config-summary');
}

export async function fetchLogTrace(requestId) {
  return api('/_proxy/logs/trace/' + encodeURIComponent(requestId));
}

export async function fetchKeyFailureSummary(id) {
  return api('/_proxy/keys/' + encodeURIComponent(id) + '/failures?limit=20');
}

export async function exportLogs() {
  const params = logQueryParams(5000);
  const response = await fetch('/_proxy/logs/export?' + params.toString(), { headers: adminHeaders() });
  if (!response.ok) throw new Error(await response.text());
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'exa-request-logs.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportAudit() {
  const response = await fetch('/_proxy/audit/export?' + auditQueryParams(5000).toString(), { headers: adminHeaders() });
  if (!response.ok) throw new Error(await response.text());
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'exa-admin-audit.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
