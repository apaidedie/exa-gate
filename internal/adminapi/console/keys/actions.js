import { el, state } from '../state.js';
import { renderKeys } from '../renderKeys.js';
import { showToast } from '../ui/toast.js';

export function clearKeyFilters() {
  el('keySearch').value = '';
  state.keyFilter = 'All';
  state.keyPage = 1;
  renderKeys();
  showToast('密钥筛选已清除。可继续搜索 ID，或按状态筛选健康/异常项。');
}

export function removeKeyFilterDimension(dimension) {
  if (dimension === 'query') {
    el('keySearch').value = '';
  } else if (dimension === 'status') {
    state.keyFilter = 'All';
  } else {
    return;
  }
  state.keyPage = 1;
  renderKeys();
  showToast(dimension === 'query' ? '已移除关键词筛选。可继续按状态筛选或搜索其他 ID。' : '已移除状态筛选。可继续搜索关键词或查看全部密钥。');
}

export function focusKeyFilterChip(chipName) {
  const apply = () => {
    const chip = document.querySelector('#keyFilterChips .chip[data-chip="' + chipName + '"]');
    if (chip instanceof HTMLElement) chip.focus();
  };
  // Double rAF covers chip re-render after filter apply; short retry covers a follow-up paint.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      apply();
      setTimeout(apply, 48);
    });
  });
}

export function applyProblemKeyFilter() {
  state.keyFilter = 'Problem';
  state.keyPage = 1;
  renderKeys();
  focusKeyFilterChip('Problem');
}
