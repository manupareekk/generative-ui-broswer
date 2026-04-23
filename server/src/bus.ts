export type StreamEvent =
  | { type: "session_started"; session_id: string }
  | { type: "phase"; phase: string; detail?: string }
  /** After a coordinate tap: model-resolved subject + the prompt used for the next image. */
  | { type: "tap_resolved"; session_id: string; subject: string; next_query: string; x: number; y: number }
  | { type: "progress"; value: number }
  | {
      type: "page";
      title: string;
      query: string;
      image_url: string;
      session_id: string;
      image_variants?: Record<string, string>;
    }
  | { type: "error"; message: string };

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
