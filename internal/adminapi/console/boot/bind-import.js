import { el } from '../state.js';
import { showErrorToast } from '../ui/toast.js';
import { acceptConfirmAction, closeConfirmAction } from '../ui/confirm-action.js';
import {
  closeImportModal,
  openImportModal,
  readImportFile,
  submitImport,
  updateImportPreview
} from '../keys/import.js';

export function bindImportEvents(ctx) {
  const {
    refresh,
    resetTimer,
    showLogin,
    showConsole,
    switchTab,
    focusControlInTab,
    runOverviewAction,
    requestPruneLogsConfirm,
    testWebhook,
    focusConfigPosture,
    copyReadinessCommand,
    runExportLogs,
    runExportAudit,
    syncAutoRefreshAria,
    bindSidebarCollapse,
    updateBatchBar,
    clearBatchSelection,
    applyKeySort,
    requestBatchDisableConfirm,
    closeMobileDetailsPanel,
    openKeyDetailFromLog,
    runKeyWorkflowAction,
    batchKeyAction,
    keyAction,
    keyPagerMaxPage,
    goKeyPage,
    runKeyEmptyAction,
    openCommandPalette,
    closeCommandPalette,
    renderCommandPalette,
    handleCommandPaletteKeydown,
    trapCommandPaletteFocus,
    shouldIgnoreCommandShortcut,
    runCommand,
    visibleCommands,
    setActiveCommand,
    resetActiveCommandIndex
  } = ctx;

el('bulkImportBtn').addEventListener('click', openImportModal);
el('closeImportModal').addEventListener('click', closeImportModal);
el('cancelImport').addEventListener('click', closeImportModal);
el('confirmImport').addEventListener('click', () => submitImport().catch((error) => showErrorToast(error)));
el('closeConfirmAction').addEventListener('click', closeConfirmAction);
el('confirmActionCancel').addEventListener('click', closeConfirmAction);
el('confirmActionAccept').addEventListener('click', () => acceptConfirmAction());
el('confirmActionModal').addEventListener('click', (event) => {
  if (event.target === el('confirmActionModal')) closeConfirmAction();
});
el('importTextarea').addEventListener('input', updateImportPreview);
el('importFileButton').addEventListener('click', () => el('importFileInput').click());
el('importFileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) readImportFile(file);
});
['dragenter', 'dragover'].forEach((eventName) => {
  el('importDropzone').addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    el('importDropzone').classList.add('is-dragging');
  });
});
el('importDropzone').addEventListener('dragleave', (event) => {
  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
  el('importDropzone').classList.remove('is-dragging');
});
el('importDropzone').addEventListener('drop', (event) => {
  event.preventDefault();
  el('importDropzone').classList.remove('is-dragging');
  const file = event.dataTransfer?.files[0];
  if (file) readImportFile(file);
});
el('importModal').addEventListener('click', (event) => {
  if (event.target === el('importModal')) closeImportModal();
});
}

