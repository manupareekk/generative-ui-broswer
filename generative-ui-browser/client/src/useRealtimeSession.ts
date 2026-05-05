import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "./apiOrigin.js";
import { logStreamEvent } from "./streamDebug.js";
import type { StreamEvent } from "./types.js";

function parseEvent(data: string): StreamEvent | null {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}

/** SSE subscription for one session (standalone generative-ui-browser client). */
export function useRealtimeSession(sessionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const push = useCallback((ev: StreamEvent) => {
    setEvents((prev) => [...prev, ev]);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setEvents([]);
    setLastError(null);

    let alive = true;
    const streamUrl = apiUrl(`/api/stream/${encodeURIComponent(sessionId)}`);
    console.info("[generative-ui-browser] SSE subscribing", streamUrl);
    const es = new EventSource(streamUrl);
    es.onopen = () => {
      if (!alive) return;
      setConnected(true);
      console.info("[generative-ui-browser] SSE open");
    };
    es.onerror = () => {
      if (!alive) return;
      setConnected(false);
      setLastError("SSE connection interrupted");
      console.warn("[generative-ui-browser] SSE error / disconnected (retrying in browser)");
    };
    es.onmessage = (m) => {
      const ev = parseEvent(m.data);
      if (!ev) {
        console.warn("[generative-ui-browser] SSE non-JSON message", m.data?.slice?.(0, 200));
        return;
      }
      logStreamEvent(ev);
      push(ev);
    };

    return () => {
      alive = false;
      setConnected(false);
      es.close();
    };
  }, [sessionId, push]);

  return { events, connected, lastError };
}

