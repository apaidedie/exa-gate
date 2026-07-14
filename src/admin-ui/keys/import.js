import { api } from '../api.js';
import { el, esc, fmt } from '../state.js';
import { showToast } from '../ui/toast.js';
import { setButtonPending } from '../ui/busy.js';
import { isUsefulFocusReturn, scheduleControlFocus, scheduleElementFocus } from '../ui/focus.js';

let importPending = false;
let importFocusReturn = null;
let refreshFn = async () => {};

export function bindImportRefresh(fn) {
  refreshFn = fn;
}

export function normalizeImportEntry(entry) {
  const value = String(entry?.value || '').trim();
  const id = String(entry?.id || '').trim();
  const normalized = { value };
  if (id) normalized.id = id;
  if (Object.prototype.hasOwnProperty.call(entry || {}, 'weight')) {
    const weight = Number(entry.weight);
    if (!Number.isInteger(weight) || weight < 1) return { entry: normalized, error: '权重必须是正整数' };
    normalized.weight = weight;
  }
  if (!value) return { entry: normalized, error: '缺少密钥值' };
  return { entry: normalized };
}

export function parseImportLine(line) {
  const text = line.trim();
  if (!text) return { skip: true };
  if (text.startsWith('{') || text.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: 'JSON 格式无法解析' };
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return { error: 'JSON 行必须是对象' };
    return normalizeImportEntry(parsed);
  }

  const parts = text.split(':');
  if (parts.length >= 3) {
    const weightText = parts[parts.length - 1].trim();
    const value = parts.slice(1, -1).join(':').trim();
    return normalizeImportEntry({ id: parts[0], value, weight: weightText });
  }
  if (parts.length === 2) return normalizeImportEntry({ id: parts[0], value: parts[1] });
  return normalizeImportEntry({ value: text });
}

export function buildImportPreview(text) {
  const rawLines = text.split(/\r?\n/);
  const keys = [];
  const issues = [];
  const seenValues = new Set();
  const seenIds = new Set();
  let duplicateCount = 0;
  let invalidCount = 0;
  let nonEmptyCount = 0;

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    nonEmptyCount += 1;
    const parsed = parseImportLine(trimmed);
    if (parsed.skip) return;
    if (parsed.error) {
      invalidCount += 1;
      if (issues.length < 4) issues.push({ tone: 'bad', text: '第 ' + fmt(index + 1) + ' 行：' + parsed.error });
      return;
    }
    const valueKey = parsed.entry.value;
    if (seenValues.has(valueKey)) {
      duplicateCount += 1;
      if (issues.length < 4) issues.push({ tone: 'warn', text: '第 ' + fmt(index + 1) + ' 行：重复密钥已跳过' });
      return;
    }
    const idKey = parsed.entry.id || '';
    if (idKey && seenIds.has(idKey)) {
      duplicateCount += 1;
      if (issues.length < 4) issues.push({ tone: 'warn', text: '第 ' + fmt(index + 1) + ' 行：重复 ID 已跳过' });
      return;
    }
    seenValues.add(valueKey);
    if (idKey) seenIds.add(idKey);
    keys.push(parsed.entry);
  });

  if (!nonEmptyCount) issues.push({ tone: 'muted', text: '粘贴密钥或选择文件后，会在这里预览导入结果。' });
  else if (keys.length) issues.unshift({ tone: 'good', text: '将提交 ' + fmt(keys.length) + ' 个可导入密钥。' });
  else issues.unshift({ tone: 'bad', text: '没有可导入的密钥，请修正后再提交。' });

  if (issues.length > 5) issues.length = 5;
  return { keys, nonEmptyCount, duplicateCount, invalidCount, issues };
}

export function renderImportPreview(preview) {
  const previewEl = el('importPreview');
  const isEmpty = preview.nonEmptyCount === 0;
  const hasWarnings = preview.duplicateCount > 0 || preview.invalidCount > 0;
  const statusClass = isEmpty ? 'is-empty' : preview.keys.length ? 'is-ready' : 'is-blocked';
  const recommendation = importPreviewRecommendation(preview);
  const stateLabel = preview.keys.length ? hasWarnings ? '可导入，有跳过项' : '可提交' : isEmpty ? '待输入' : '需要修正';
  previewEl.className = 'import-preview ' + statusClass + (hasWarnings ? ' has-warnings' : '');
  previewEl.setAttribute('role', 'status');
  previewEl.setAttribute('aria-live', 'polite');
  previewEl.setAttribute('aria-atomic', 'true');
  const previewNext = preview.keys.length
    ? '可点击开始导入提交，或继续修改输入'
    : isEmpty
      ? '可粘贴密钥或选择文件后预检'
      : '请修正无效行或删除重复项后再试';
  previewEl.setAttribute(
    'aria-label',
    '导入预览：' + recommendation.title + '。可导入 ' + fmt(preview.keys.length) + '，重复 ' + fmt(preview.duplicateCount) + '，无效 ' + fmt(preview.invalidCount) + '。' + recommendation.text + '。' + previewNext
  );
  previewEl.innerHTML = '<div class="import-preview-head"><span class="import-preview-title">导入预览</span><span class="import-preview-state">' + esc(stateLabel) + '</span></div>' +
    '<div class="import-stats">' +
      '<div class="import-stat good"><span>可导入</span><strong>' + fmt(preview.keys.length) + '</strong></div>' +
      '<div class="import-stat warn"><span>重复</span><strong>' + fmt(preview.duplicateCount) + '</strong></div>' +
      '<div class="import-stat bad"><span>无效</span><strong>' + fmt(preview.invalidCount) + '</strong></div>' +
    '</div>' +
    '<div class="import-recommendation ' + esc(recommendation.tone) + '"><strong>' + esc(recommendation.title) + '</strong><span>' + esc(recommendation.text) + '</span></div>' +
    '<ul class="import-issues">' + preview.issues.map((issue) => '<li class="' + (issue.tone || '') + '">' + esc(issue.text) + '</li>').join('') + '</ul>';
  const confirm = el('confirmImport');
  if (confirm) {
    const canSubmit = !importPending && preview.keys.length > 0;
    confirm.disabled = !canSubmit;
    confirm.setAttribute(
      'aria-label',
      canSubmit
        ? '确认开始批量导入 ' + fmt(preview.keys.length) + ' 个密钥。提交后会刷新密钥池并写入审计'
        : isEmpty
          ? '开始导入不可用。请先粘贴或选择可导入密钥'
          : '开始导入不可用。请修正预检问题后再试'
    );
  }
  return preview;
}

export function importPreviewRecommendation(preview) {
  if (preview.nonEmptyCount === 0) {
    return { tone: 'muted', title: '待输入', text: '粘贴密钥或选择文件后，预检会显示可导入、重复和无效行。' };
  }
  const skipped = preview.duplicateCount + preview.invalidCount;
  if (preview.keys.length === 0) {
    return { tone: 'bad', title: '需要修正', text: '当前输入没有可导入密钥，请修正无效行或删除重复项。' };
  }
  if (skipped > 0) {
    return { tone: 'warn', title: '可导入，但有跳过项', text: '将导入 ' + fmt(preview.keys.length) + ' 个密钥，并跳过 ' + fmt(skipped) + ' 行。' };
  }
  return { tone: 'good', title: '可以提交', text: '将导入 ' + fmt(preview.keys.length) + ' 个密钥，提交后会刷新密钥池并写入审计。' };
}

export function updateImportPreview() {
  return renderImportPreview(buildImportPreview(el('importTextarea').value));
}

export function isSupportedImportFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return type.startsWith('text/') || type === 'application/json' || ['.txt', '.csv', '.json'].some((suffix) => name.endsWith(suffix));
}

export function setImportFileStatus(stateName, message) {
  const target = el('importFileName');
  if (!target) return;
  const safeState = ['idle', 'reading', 'ready', 'error'].includes(stateName) ? stateName : 'idle';
  const text = String(message || '').trim() || '待选文件';
  const labelPrefix = {
    idle: '导入文件：',
    reading: '导入文件读取中：',
    ready: '导入文件已载入：',
    error: '导入文件错误：'
  }[safeState];
  const fileNext = {
    idle: '可拖入或选择 .txt / .csv / .json 文件',
    reading: '请稍候',
    ready: '可继续编辑文本或点击开始导入',
    error: '请改选文本密钥文件后重试'
  }[safeState];
  target.dataset.importFileState = safeState;
  target.className = 'import-file-name is-' + safeState;
  target.setAttribute('role', 'status');
  target.setAttribute('aria-atomic', 'true');
  target.setAttribute('aria-live', safeState === 'error' ? 'assertive' : 'polite');
  target.setAttribute('aria-label', labelPrefix + text + '。' + fileNext);
  target.textContent = text;
}

export function readImportFile(file) {
  if (!isSupportedImportFile(file)) {
    setImportFileStatus('error', '不支持的文件类型');
    showToast('仅支持 .txt、.csv 或 .json 文本文件。请改选文本密钥文件后重试。', 'warn');
    return;
  }
  setImportFileStatus('reading', '正在读取 ' + file.name);
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
    el('importTextarea').value = text;
    setImportFileStatus('ready', file.name + ' · ' + fmt(lineCount) + ' 行');
    el('importTextarea').dispatchEvent(new Event('input'));
  };
  reader.onerror = () => {
    setImportFileStatus('error', '文件读取失败');
    showToast('文件读取失败，请重新选择文本密钥文件后重试。', 'bad');
  };
  reader.readAsText(file);
}

export function focusableImportControls() {
  return Array.from(el('importModal').querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'))
    .filter((control) => !control.disabled && !control.hidden && control.offsetParent !== null);
}

export function rememberImportFocusReturn(preferred = null) {
  if (isUsefulFocusReturn(preferred)) {
    importFocusReturn = preferred;
    return;
  }
  const active = document.activeElement;
  importFocusReturn = isUsefulFocusReturn(active) ? active : null;
}

export function restoreImportFocus() {
  const returnTarget = importFocusReturn;
  importFocusReturn = null;
  scheduleElementFocus(() => {
    if (isUsefulFocusReturn(returnTarget) && returnTarget.isConnected) return returnTarget;
    return el('bulkImportBtn');
  });
}

export function trapImportFocus(event) {
  if (event.key !== 'Tab' || !el('importModal').classList.contains('modal-open')) return;
  const controls = focusableImportControls();
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openImportModal({ returnFocus = null } = {}) {
  // Prefer an explicit return target (e.g. bulkImportBtn after command palette import).
  rememberImportFocusReturn(returnFocus);
  importPending = false;
  el('importTextarea').value = '';
  el('importFileInput').value = '';
  setImportFileStatus('idle', '待选文件');
  el('importDropzone').classList.remove('is-dragging');
  const confirm = el('confirmImport');
  if (confirm) {
    confirm.textContent = '开始导入';
    confirm.setAttribute('aria-label', '开始导入不可用。请先粘贴或选择可导入密钥');
  }
  const bulk = el('bulkImportBtn');
  if (bulk) bulk.setAttribute('aria-label', '批量导入已打开。可粘贴密钥或选择文件后预检');
  const closeBtn = el('closeImportModal');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭批量导入，返回密钥池。可继续筛选或管理密钥');
  const cancel = el('cancelImport');
  if (cancel) cancel.setAttribute('aria-label', '取消批量导入，返回密钥池。可继续筛选或管理密钥');
  updateImportPreview();
  el('importModal').classList.add('modal-open');
  // Only focus the textarea — do not race with bulkImportBtn focus from the opener.
  scheduleControlFocus('importTextarea');
}

export function closeImportModal() {
  if (!el('importModal').classList.contains('modal-open')) return;
  el('importModal').classList.remove('modal-open');
  const bulk = el('bulkImportBtn');
  if (bulk) bulk.setAttribute('aria-label', '打开批量导入密钥。可粘贴或选择文件后预检再提交，导入后可测试连通性');
  const closeBtn = el('closeImportModal');
  if (closeBtn) closeBtn.setAttribute('aria-label', '关闭批量导入，返回密钥池。可继续筛选或管理密钥');
  const cancel = el('cancelImport');
  if (cancel) cancel.setAttribute('aria-label', '取消批量导入，返回密钥池。可继续筛选或管理密钥');
  restoreImportFocus();
}

async export function submitImport() {
  const { keys } = updateImportPreview();
  if (!keys.length) { showToast('未解析到有效密钥。请检查格式（每行一个 Key 或 id:key:weight）后重试。', 'warn'); return; }

  importPending = true;
  const restore = setButtonPending(el('confirmImport'), '正在导入…');
  try {
    const result = await api('/_proxy/keys/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keys })
    });
    showToast('导入完成：成功 ' + fmt(result.imported) + '，跳过 ' + fmt(result.skipped) + (result.totalErrors ? '，错误 ' + fmt(result.totalErrors) : '') + '。可在密钥池筛选新导入项并测试连通性。', result.totalErrors ? 'warn' : 'good');
    closeImportModal();
    await refreshFn({ force: true });
  } catch (error) {
    showToast('导入失败：' + (error.message || '未知错误') + '。请检查文件格式后重试。', 'bad');
  } finally {
    importPending = false;
    restore();
    if (el('importModal').classList.contains('modal-open')) updateImportPreview();
  }
}

