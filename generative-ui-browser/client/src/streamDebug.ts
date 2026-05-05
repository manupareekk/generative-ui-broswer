import type { StreamEvent } from "./types.js";

const PREFIX = "[generative-ui-browser]";

/** One-line summary for console / inspector panel. */
export function formatStreamEvent(e: StreamEvent): string {
  switch (e.type) {
    case "session_started":
      return `session_started ${e.session_id?.slice(0, 12)}…`;
    case "phase":
      return `phase:${e.phase}${e.detail ? ` — ${e.detail}` : ""}`;
    case "progress":
      return `progress:${e.value}`;
    case "region_resolved":
      return `region_resolved subject="${(e.subject || "").slice(0, 60)}"`;
    case "page":
      return `page title="${(e.title || "").slice(0, 50)}" trace=${e.client_trace?.slice(0, 8) ?? "—"}`;
    case "error":
      return `error ${(e.message || "").slice(0, 120)}`;
    default:
      return String((e as { type?: string }).type ?? "?");
  }
}

export function logStreamEvent(ev: StreamEvent): void {
  const line = formatStreamEvent(ev);
  console.info(PREFIX, line, ev);
}
