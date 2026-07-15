import { el, fmt, state } from '../state.js';
import { keyScopeHint, keyScopeText } from './render-shared.js';

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
        ? ('密钥池工作流摘要：已选 ' + fmt(selectedCount) + ' 个。可批量操作、筛选异常或调整搜索。点选指标后继续管理密钥')
        : '密钥池工作流摘要：可重置筛选、筛选异常、搜索收窄或勾选后批量操作。点选指标后继续管理密钥'
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

export function renderKeyWorkflowSummary({ rows, pageRows, problemCount, filter, query, totalPages, start }) {
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
  const resetAction = hasFilter ? '清除密钥筛选，恢复全部密钥。可继续搜索 ID 或按状态筛选' : '聚焦全部密钥筛选入口';
  const problemAction = problemCount ? '筛选异常密钥并复核' : '当前范围没有异常密钥，可继续观察或导入密钥';
  const scopeAction = hasFilter ? '聚焦密钥搜索，调整当前筛选范围' : '聚焦密钥搜索，收窄密钥范围';
  syncKeyWorkflowAction('reset', false, '当前显示：' + visibleCountText + '，' + pageHintText + '。' + resetAction);
  syncKeyWorkflowAction('problems', problemCount === 0, '异常压力：' + fmt(problemCount) + '，' + problemHintText + '。' + problemAction);
  syncKeyWorkflowAction('scope', false, '筛选范围：' + scopeText + '，' + scopeHintText + '。' + scopeAction);
  if (scope) scope.title = '筛选范围：' + scopeText + '。' + scopeAction;
  updateKeyWorkflowSelection();
}
