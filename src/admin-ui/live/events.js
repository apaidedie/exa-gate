import { currentSessionId } from '../api.js';
import { state } from '../state.js';
import { setLiveLinkStatus } from './refresh.js';

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
      if (!currentSessionId() || document.querySelector('[data-console-shell]')?.hidden) setLiveLinkStatus('offline');
      return;
    }
    clearTimeout(reconnectTimer);
    const source = new EventSource('/_proxy/events?sessionId=' + encodeURIComponent(currentSessionId()));
    state.events = source;
    setLiveLinkStatus('reconnecting');
    source.onopen = () => setLiveLinkStatus('live');
    source.addEventListener('snapshot', () => {
      if (state.eventRefreshPending || document.querySelector('[data-console-shell]').hidden) return;
      state.eventRefreshPending = true;
      setLiveLinkStatus('live');
      window.setTimeout(() => {
        refresh().catch((error) => {
          if (isSessionExpiredError(error)) forceSessionExpired(error.message);
        }).finally(() => { state.eventRefreshPending = false; });
      }, 350);
    });
    source.onerror = () => {
      closeEventStream();
      if (document.querySelector('[data-console-shell]')?.hidden || !currentSessionId()) {
        setLiveLinkStatus('offline');
        return;
      }
      setLiveLinkStatus('reconnecting');
      reconnectTimer = window.setTimeout(connectEventStream, 5000);
    };
  }

  return { connectEventStream };
}
