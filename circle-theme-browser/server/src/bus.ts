export type StreamEvent =
  | { type: "session_started"; session_id: string }
  | { type: "phase"; phase: string; detail?: string }
  | { type: "progress"; value: number }
  | {
      type: "region_resolved";
      session_id: string;
      subject: string;
      next_query: string;
      cx_px: number;
      cy_px: number;
      r_px: number;
    }
  | {
      type: "page";
      title: string;
      query: string;
      /** Short text the user typed to start this branch (e.g. "Japan"); used for sketch retrieval, not the long compiled prompt in `query`. */
      anchor_query?: string;
      image_url: string;
      session_id: string;
      image_variants?: Record<string, string>;
      /** Echoed from the client when present so the UI can match async completions. */
      client_trace?: string;
    }
  | { type: "error"; message: string; client_trace?: string };

type Listener = (ev: StreamEvent) => void;

const channels = new Map<string, Set<Listener>>();
const pending = new Map<string, StreamEvent[]>();
const MAX_PENDING = 250;

function enqueue(sessionId: string, event: StreamEvent): void {
  const q = pending.get(sessionId) ?? [];
  q.push(event);
  if (q.length > MAX_PENDING) q.splice(0, q.length - MAX_PENDING);
  pending.set(sessionId, q);
}

export function subscribe(sessionId: string, listener: Listener): () => void {
  let set = channels.get(sessionId);
  if (!set) {
    set = new Set();
    channels.set(sessionId, set);
  }

  const queued = pending.get(sessionId);
  if (queued?.length) {
    for (const ev of queued) listener(ev);
    pending.delete(sessionId);
  }

  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) channels.delete(sessionId);
  };
}

export function publish(sessionId: string, event: StreamEvent): void {
  const set = channels.get(sessionId);
  if (!set || set.size === 0) {
    enqueue(sessionId, event);
    return;
  }
  for (const listener of set) listener(event);
}
