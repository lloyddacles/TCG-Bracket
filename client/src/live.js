import { useEffect, useRef } from 'react';
import { getToken } from './api.js';

// Live updates over Server-Sent Events. We read the stream with fetch so the
// Authorization header can be attached (EventSource cannot send headers), and
// silently fall back to interval polling if streaming is unavailable.

const COALESCE_MS = 250;

async function readStream(url, token, onData, signal) {
  const res = await fetch(url, {
    headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
    signal,
    cache: 'no-store',
  });
  if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const drain = (block) => {
    for (const line of block.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          onData(JSON.parse(line.slice(6)));
        } catch {
          // ignore malformed frames
        }
      }
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    // eslint-disable-next-line no-cond-assign
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block && !block.startsWith(':')) drain(block);
    }
  }
}

// Subscribes to a server-sent-events endpoint and reports every change.
//  path       — e.g. `/api/tournaments/12/events` or `/api/tournaments/events`
//  onEvent    — called (debounced) whenever the server signals a change
//  fallbackMs — polling interval used only when streaming is unavailable
export function useLive({ path, onEvent, enabled = true, fallbackMs = 20000 }) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !path) return undefined;
    const token = getToken();
    if (!token) return undefined;

    let disposed = false;
    let controller = null;
    let pollTimer = null;
    let coalesceTimer = null;

    const notify = () => {
      if (disposed) return;
      if (coalesceTimer) return;
      coalesceTimer = setTimeout(() => {
        coalesceTimer = null;
        if (disposed || document.hidden) return;
        cbRef.current?.();
      }, COALESCE_MS);
    };

    const startPolling = () => {
      if (pollTimer || disposed) return;
      pollTimer = setInterval(() => {
        if (!document.hidden) cbRef.current?.();
      }, fallbackMs);
    };

    const connect = async () => {
      if (disposed) return;
      controller = new AbortController();
      try {
        await readStream(path, token, notify, controller.signal);
        // Server closed the stream (restart, proxy timeout) — reconnect soon.
        if (!disposed) setTimeout(connect, 3000);
      } catch (err) {
        if (disposed || err?.name === 'AbortError') return;
        startPolling();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !disposed) cbRef.current?.();
    };

    connect();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      controller?.abort();
      if (pollTimer) clearInterval(pollTimer);
      if (coalesceTimer) clearTimeout(coalesceTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [path, enabled, fallbackMs]);
}
