import { bindSessionEvents } from './bind-session.js';
import { bindLogEvents } from './bind-logs.js';
import { bindKeyEvents } from './bind-keys.js';
import { bindAuditEvents } from './bind-audit.js';
import { bindImportEvents } from './bind-import.js';
import { bindCommandEvents } from './bind-command.js';
import { bindShellEvents } from './bind-shell.js';

export function bindConsoleEvents(ctx) {
  bindSessionEvents(ctx);
  bindLogEvents(ctx);
  bindKeyEvents(ctx);
  bindAuditEvents(ctx);
  bindImportEvents(ctx);
  bindCommandEvents(ctx);
  bindShellEvents(ctx);
}
