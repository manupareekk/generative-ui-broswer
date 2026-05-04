import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "./apiOrigin.js";
import type { StreamEvent } from "./types.js";

function parseEvent(data: string): StreamEvent | null {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}

/** SSE subscription for one session (no dependency on the main generative-browser app). */
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
    const es = new EventSource(apiUrl(`/api/stream/${encodeURIComponent(sessionId)}`));
    es.onopen = () => alive && setConnected(true);
    es.onerror = () => {
      if (!alive) return;
      setConnected(false);
      setLastError("SSE connection interrupted");
    };
    es.onmessage = (m) => {
      const ev = parseEvent(m.data);
      if (ev) push(ev);
    };

    return () => {
      alive = false;
      setConnected(false);
      es.close();
    };
  }, [sessionId, push]);

  return { events, connected, lastError };
}
