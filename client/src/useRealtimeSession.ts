import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, apiWebSocketUrl } from "./apiOrigin.js";
import type { StreamEvent } from "./types.js";

type ConnectionMode = "sse" | "ws" | "both";

function parseEvent(data: string): StreamEvent | null {
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}

/**
 * Maintains a live channel (SSE + optional WebSocket) and merges duplicate events defensively.
 */
export function useRealtimeSession(sessionId: string | null, mode: ConnectionMode = "both") {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const seenPages = useRef(new Set<string>());

  const push = useCallback((ev: StreamEvent) => {
    if (ev.type === "page") {
      const key = `${ev.session_id}:${ev.image_url}`;
      if (seenPages.current.has(key)) return;
      seenPages.current.add(key);
    }
    setEvents((prev) => [...prev, ev]);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    seenPages.current.clear();
    setEvents([]);
    setLastError(null);

    let alive = true;
    const sources: Array<() => void> = [];

    const useSse = mode === "sse" || mode === "both";
    const useWs = mode === "ws" || mode === "both";

    if (useSse) {
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
      sources.push(() => es.close());
    }

    if (useWs) {
      const ws = new WebSocket(apiWebSocketUrl(sessionId));
      ws.onopen = () => alive && setConnected(true);
      ws.onerror = () => {
        if (!alive) return;
        setLastError((e) => e ?? "WebSocket error");
      };
      ws.onmessage = (m) => {
        const ev = parseEvent(String(m.data));
        if (ev) push(ev);
      };
      sources.push(() => ws.close());
    }

    return () => {
      alive = false;
      setConnected(false);
      for (const stop of sources) stop();
    };
  }, [sessionId, mode, push]);

  return { events, connected, lastError };
}
