import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "./apiOrigin.js";
import { useRealtimeSession } from "./useRealtimeSession.js";
import type { StreamEvent } from "./types.js";
import "./App.css";

/** Bitmap “page” with Flipbook-style tap-anywhere (no visible hit boxes). */
function TapSurface(props: {
  src: string;
  title: string;
  onTap: (nx: number, ny: number) => void;
  locked: boolean;
}) {
  return (
    <div className="tap-surface">
      <img
        className="tap-img"
        src={props.src}
        alt={props.title}
        decoding="async"
        draggable={false}
        onClick={
          props.locked
            ? undefined
            : (e) => {
                const el = e.currentTarget;
                const r = el.getBoundingClientRect();
                const nx = (e.clientX - r.left) / Math.max(r.width, 1);
                const ny = (e.clientY - r.top) / Math.max(r.height, 1);
                props.onTap(nx, ny);
              }
        }
      />
    </div>
  );
}

function latestPage(events: StreamEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "page") return e;
  }
  return null;
}

export function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [query, setQuery] = useState("A calm macOS settings screen for focus mode.");
  const [busy, setBusy] = useState(false);
  const [tapPending, setTapPending] = useState(false);
  const lastTapQuery = useRef<string | null>(null);
  const { events, connected, lastError } = useRealtimeSession(sessionId, "sse");

  const page = useMemo(() => latestPage(events), [events]);

  useEffect(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "tap_resolved") {
        if (e.next_query !== lastTapQuery.current) {
          lastTapQuery.current = e.next_query;
          setQuery(e.next_query);
        }
        return;
      }
    }
  }, [events]);

  useEffect(() => {
    if (!tapPending || events.length === 0) return;
    const tail = events[events.length - 1];
    if (tail.type === "page" || tail.type === "error") setTapPending(false);
  }, [events, tapPending]);

  const phase = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "phase") return e.phase + (e.detail ? ` — ${e.detail}` : "");
    }
    return "";
  }, [events]);

  const progress = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "progress") return e.value;
    }
    return undefined;
  }, [events]);

  const streamError = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "error") return e.message;
    }
    return null;
  }, [events]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const res = await fetch(apiUrl("/api/session"), { method: "POST" });
    if (!res.ok) throw new Error("Could not create session");
    const json = (await res.json()) as { session_id: string };
    setSessionId(json.session_id);
    return json.session_id;
  }, [sessionId]);

  const navigate = useCallback(
    async (overrideQuery?: string) => {
      const effective = (overrideQuery ?? query).trim();
      if (!effective) return;

      setBusy(true);
      try {
        const sid = await ensureSession();
        if (overrideQuery !== undefined) setQuery(overrideQuery);
        const res = await fetch(apiUrl("/api/navigate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, query: effective }),
        });
        if (!res.ok && res.status !== 202) {
          const t = await res.text();
          throw new Error(t || "Navigate failed");
        }
      } catch (e) {
        console.error(e);
      } finally {
        setBusy(false);
      }
    },
    [ensureSession, query],
  );

  const pageRef = useRef(page);
  pageRef.current = page;

  const tapNavigate = useCallback(
    async (nx: number, ny: number) => {
      const p = pageRef.current;
      if (!p || tapPending) return;
      setBusy(true);
      setTapPending(true);
      try {
        const sid = await ensureSession();
        const res = await fetch(apiUrl("/api/tap"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sid,
            x: nx,
            y: ny,
            image_url: p.image_url,
            page_query: p.query,
          }),
        });
        if (!res.ok && res.status !== 202) {
          const t = await res.text();
          throw new Error(t || "Tap failed");
        }
      } catch (e) {
        console.error(e);
        setTapPending(false);
      } finally {
        setBusy(false);
      }
    },
    [ensureSession, tapPending],
  );

  const locked = busy || tapPending;

  return (
    <div className="app">
      <p className="tagline">
        Like{" "}
        <a href="https://flipbook.page" target="_blank" rel="noreferrer">
          Flipbook
        </a>
        : every page is a generated image — click <em>anywhere</em> on it to follow that spot like a link.
      </p>

      <div className="mac-window" role="application" aria-label="Generative browser window">
        <div className="mac-titlebar">
          <span className="mac-traffic" aria-hidden="true">
            <span className="mac-dot mac-dot-close" />
            <span className="mac-dot mac-dot-min" />
            <span className="mac-dot mac-dot-zoom" />
          </span>
          <span className="mac-window-title">{page?.title || "Generative Browser"}</span>
          <span
            className={`mac-live ${connected ? "mac-live-on" : "mac-live-off"}`}
            title={connected ? "Stream connected" : "Stream disconnected"}
          >
            {connected ? "Live" : "Offline"}
          </span>
        </div>

        <div className="mac-toolbar">
          <div className="mac-url-wrap">
            <span className="mac-url-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              className="mac-url"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask for a page…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void navigate(undefined);
              }}
              spellCheck={false}
            />
          </div>
          <button type="button" className="mac-go" onClick={() => void navigate(undefined)} disabled={locked}>
            {locked ? "…" : "Go"}
          </button>
        </div>

        <div className="mac-status">
          {phase ? <span className="mac-phase">{phase}</span> : null}
          {typeof progress === "number" ? (
            <div className="mac-progress">
              <div className="mac-progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
          ) : null}
          {streamError || lastError ? (
            <span className="mac-err">{streamError || lastError}</span>
          ) : null}
        </div>

        <div className="mac-viewport">
          {page ? (
            <TapSurface
              src={page.image_url}
              title={page.title}
              onTap={(nx, ny) => void tapNavigate(nx, ny)}
              locked={locked}
            />
          ) : (
            <div className="mac-empty">
              <div className="mac-empty-title">No page yet</div>
              <p>
                Press <strong>Go</strong> to generate a screen. Then click anywhere on the image — no buttons are
                drawn on top; the model figures out what you meant from the pixel you chose.
              </p>
            </div>
          )}
        </div>

        <details className="mac-log">
          <summary>Stream log ({events.length})</summary>
          <pre>{JSON.stringify(events.slice(-32), null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
