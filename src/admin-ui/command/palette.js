import { el, esc, fmt } from '../state.js';
import { isUsefulFocusReturn, scheduleControlFocus, scheduleElementFocus } from '../ui/focus.js';
import { isConfirmActionOpen } from '../ui/confirm-action.js';

export function createCommandPalette({ commandDefinitions }) {
  let commandPaletteFocusReturn = null;
  let activeCommandIndex = 0;

  function commandSearchText(command) {
    return [command.title, command.group, command.description, command.chip, command.aliases].join(' ').toLowerCase();
  }

  function visibleCommands() {
    const query = el('commandSearch')?.value?.trim().toLowerCase() || '';
    if (!query) return commandDefinitions;
    return commandDefinitions.filter((command) => commandSearchText(command).includes(query));
  }

  function commandGroupsFor(commands) {
    return [...new Set(commands.map((command) => command.group))];
  }

  function syncCommandPaletteContext(commands) {
    const groups = commandGroupsFor(commands);
    const query = el('commandSearch')?.value?.trim() || '';
    const groupText = groups.length ? groups.join(' · ') : '无匹配';
    const scopeText = query ? '关键词 “' + query + '”' : '全部命令';
    const resultText = fmt(commands.length) + ' / ' + fmt(commandDefinitions.length);
    const nextAction = commands.length
      ? (query ? '可用方向键选择并按 Enter 执行' : '可搜索命令，或方向键选择后按 Enter 执行')
      : '可清空搜索恢复全部命令，或改用密钥、日志、审计等词重试';
    el('commandResultCount').textContent = resultText;
    el('commandResultCount').setAttribute('aria-label', '匹配命令：' + resultText + '。' + nextAction);
    el('commandGroupCount').textContent = groupText;
    el('commandGroupCount').title = groupText;
    el('commandGroupCount').setAttribute('aria-label', '可用分组：' + groupText + '。' + nextAction);
    el('commandSearchScope').textContent = scopeText;
    el('commandSearchScope').title = scopeText;
    el('commandSearchScope').setAttribute('aria-label', '搜索范围：' + scopeText + '。' + nextAction);
    const context = el('commandPaletteContext');
    if (context) {
      context.setAttribute(
        'aria-label',
        '快速操作范围：匹配 ' + resultText + '，分组 ' + groupText + '，范围 ' + scopeText + '。' + nextAction
      );
    }
    const list = el('commandList');
    if (list) {
      list.setAttribute(
        'aria-label',
        commands.length
          ? ('快速操作列表：' + resultText + '。' + nextAction)
          : ('快速操作列表：无匹配。' + nextAction)
      );
    }
  }

  function setActiveCommand(index, commands = visibleCommands()) {
    activeCommandIndex = Math.max(0, Math.min(index, Math.max(0, commands.length - 1)));
    document.querySelectorAll('.command-option').forEach((button, itemIndex) => {
      const active = itemIndex === activeCommandIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      if (active) el('commandSearch').setAttribute('aria-activedescendant', button.id);
    });
  }

  function renderCommandPalette() {
    const list = el('commandList');
    const empty = el('commandEmpty');
    const commands = visibleCommands();
    syncCommandPaletteContext(commands);
    if (!commands.length) {
      list.hidden = true;
      list.innerHTML = '';
      empty.hidden = false;
      el('commandSearch').setAttribute('aria-activedescendant', '');
      return;
    }
    list.hidden = false;
    empty.hidden = true;
    let optionIndex = 0;
    const groups = [];
    for (const command of commands) {
      let group = groups.find((item) => item.name === command.group);
      if (!group) {
        group = { name: command.group, commands: [] };
        groups.push(group);
      }
      group.commands.push(command);
    }
    list.innerHTML = groups.map((group) => '<div class="command-group"><span class="command-group-label">' + esc(group.name) + '</span>' + group.commands.map((command) => {
      const index = optionIndex;
      optionIndex += 1;
      const actionText = command.group + ' · ' + command.chip;
      const optionAria = '快速操作：' + command.title + '。' + command.description + '。分组 ' + actionText + '。可方向键选择后按 Enter 执行';
      return '<button id="commandOption-' + esc(command.id) + '" class="command-option" type="button" role="option" aria-selected="false" data-command-index="' + index + '" data-command-id="' + esc(command.id) + '" aria-label="' + esc(optionAria) + '" title="' + esc(optionAria) + '"><span class="command-option-main"><span class="command-option-title">' + esc(command.title) + '</span><span class="command-option-desc">' + esc(command.description) + '</span><span class="command-option-meta"><span>' + esc(command.group) + '</span><em aria-hidden="true">' + esc(command.chip) + '</em></span></span><span class="command-option-chip" aria-hidden="true" title="' + esc(actionText) + '">' + esc(command.chip) + '</span></button>';
    }).join('') + '</div>').join('');
    setActiveCommand(Math.min(activeCommandIndex, commands.length - 1), commands);
  }

  function focusableCommandControls() {
    return Array.from(el('commandPalette').querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'))
      .filter((control) => !control.disabled && !control.hidden && control.offsetParent !== null);
  }

  function openCommandPalette(opener = document.activeElement) {
    const palette = el('commandPalette');
    if (document.querySelector('[data-console-shell]')?.hidden) return;
    if (!palette.hidden) return;
    commandPaletteFocusReturn = isUsefulFocusReturn(opener) ? opener : null;
    el('commandSearch').value = '';
    activeCommandIndex = 0;
    renderCommandPalette();
    palette.hidden = false;
    palette.classList.add('is-open');
    const openBtn = el('openCommandPalette');
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'true');
      openBtn.setAttribute('aria-label', '快速操作已打开。可搜索命令，或按 Esc 关闭');
    }
    const closeBtn = el('closeCommandPalette');
    if (closeBtn) closeBtn.setAttribute('aria-label', '关闭快速操作，返回控制台。可继续管理密钥或刷新状态');
    scheduleControlFocus('commandSearch');
  }

  function closeCommandPalette({ restoreFocus = true } = {}) {
    const palette = el('commandPalette');
    if (palette.hidden) return;
    palette.classList.remove('is-open');
    palette.hidden = true;
    const openBtn = el('openCommandPalette');
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
      openBtn.setAttribute('aria-label', '打开快速操作（Ctrl K 或 Cmd K）。可搜索命令后按 Enter 执行');
    }
    const closeBtn = el('closeCommandPalette');
    if (closeBtn) closeBtn.setAttribute('aria-label', '关闭快速操作，返回控制台。可继续管理密钥或刷新状态');
    el('commandSearch').setAttribute('aria-activedescendant', '');
    if (restoreFocus) {
      const returnTarget = commandPaletteFocusReturn;
      scheduleElementFocus(() => (isUsefulFocusReturn(returnTarget) && returnTarget.isConnected ? returnTarget : el('openCommandPalette')));
    }
    commandPaletteFocusReturn = null;
  }

  function runCommand(command) {
    if (!command) return;
    closeCommandPalette({ restoreFocus: false });
    command.run();
  }

  function runActiveCommand() {
    const commands = visibleCommands();
    runCommand(commands[activeCommandIndex]);
  }

  function trapCommandPaletteFocus(event) {
    if (event.key !== 'Tab' || el('commandPalette').hidden) return;
    const controls = focusableCommandControls();
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

  function handleCommandPaletteKeydown(event) {
    if (el('commandPalette').hidden) return;
    const commands = visibleCommands();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveCommand(activeCommandIndex + 1, commands);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveCommand(activeCommandIndex - 1, commands);
    } else if (event.key === 'Enter') {
      if (event.target instanceof HTMLElement && event.target.id === 'closeCommandPalette') return;
      event.preventDefault();
      if (event.target instanceof HTMLElement && event.target.matches('.command-option')) {
        runCommand(commands[Number(event.target.dataset.commandIndex)]);
        return;
      }
      runActiveCommand();
    }
  }

  function shouldIgnoreCommandShortcut(event) {
    if (document.querySelector('[data-console-shell]')?.hidden) return true;
    if (el('importModal').classList.contains('modal-open')) return true;
    if (isConfirmActionOpen()) return true;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  return {
    openCommandPalette,
    closeCommandPalette,
    renderCommandPalette,
    handleCommandPaletteKeydown,
    trapCommandPaletteFocus,
    shouldIgnoreCommandShortcut,
    runCommand,
    visibleCommands,
    setActiveCommand,
    resetActiveCommandIndex: () => { activeCommandIndex = 0; }
  };
}
