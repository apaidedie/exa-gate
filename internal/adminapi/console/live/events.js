import { currentSessionId } from '../api.js';
import { state } from '../state.js';

let reconnectTimer;

export function closeEventStream() {
  if (state.events) state.events.close();
  state.events = null;
  state.eventRefreshPending = false;
  clearTimeout(reconnectTimer);
}

export function createEventStream({ refresh, isSessionExpiredError, forceSessionExpired }) {
  function connectEventStream() {
    if (!window.EventSource || state.events || !currentSessionId()) {
      if (!currentSessionId() || document.querySelector('[data-console-shell]')?.hidden)      return;
    }
    clearTimeout(reconnectTimer);
    const source = new EventSource('/_proxy/events?sessionId=' + encodeURIComponent(currentSessionId()));
    state.events = source;
    source.onopen = () =>    source.addEventListener('snapshot', () => {
      if (state.eventRefreshPending || document.querySelector('[data-console-shell]').hidden) return;
      state.eventRefreshPending = true;
      window.setTimeout(() => {
        refresh({ silent: true }).catch((error) => {
          if (isSessionExpiredError(error)) forceSessionExpired(error.message);
        }).finally(() => { state.eventRefreshPending = false; });
      }, 350);
    });
    source.onerror = () => {
      closeEventStream();
      if (document.querySelector('[data-console-shell]')?.hidden || !currentSessionId()) {
        return;
      }
      reconnectTimer = window.setTimeout(connectEventStream, 5000);
    };
  }

  return { connectEventStream };
}
