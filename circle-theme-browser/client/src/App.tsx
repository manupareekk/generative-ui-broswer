import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl } from "./apiOrigin.js";
import { SketchOverlay } from "./SketchOverlay.js";
import type { StreamEvent } from "./types.js";
import { useRealtimeSession } from "./useRealtimeSession.js";

function latestPage(events: StreamEvent[]): {
  query: string;
  image_url: string;
  title: string;
  anchor_query?: string;
} | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "page")
      return { query: e.query, image_url: e.image_url, title: e.title, anchor_query: e.anchor_query };
  }
  return null;
}

/** Most recent error after the latest successful page (so old errors do not linger in the UI). */
function latestRelevantError(events: StreamEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "page") return null;
    if (e.type === "error") return e.message;
  }
  return null;
}

export function App() {
  const [query, setQuery] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [genPending, setGenPending] = useState(false);
  const [regionBusy, setRegionBusy] = useState(false);
  const [pendingTrace, setPendingTrace] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"gen" | "region" | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [transientHint, setTransientHint] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const errLiveRef = useRef<HTMLDivElement>(null);

  const { events } = useRealtimeSession(sessionId);

  const page = useMemo(() => latestPage(events), [events]);
  const streamError = useMemo(() => latestRelevantError(events), [events]);

  useEffect(() => {
    if (!streamError || !errLiveRef.current) return;
    errLiveRef.current.textContent = streamError;
  }, [streamError]);

  useEffect(() => {
    if (streamError || fetchError) setErrorDismissed(false);
  }, [streamError, fetchError]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const showHint = useCallback((message: string) => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setTransientHint(message);
    hintTimerRef.current = setTimeout(() => {
      setTransientHint(null);
      hintTimerRef.current = null;
    }, 4200);
  }, []);

  const bannerError =
    errorDismissed ? null : streamError || fetchError;

  useEffect(() => {
    if (!pendingTrace || !pendingKind) return;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "error" && e.client_trace === pendingTrace) {
        if (pendingKind === "gen") setGenPending(false);
        if (pendingKind === "region") setRegionBusy(false);
        setPendingTrace(null);
        setPendingKind(null);
        return;
      }
      if (e.type === "page" && e.client_trace === pendingTrace) {
        if (pendingKind === "gen") setGenPending(false);
        if (pendingKind === "region") setRegionBusy(false);
        setPendingTrace(null);
        setPendingKind(null);
        return;
      }
    }
  }, [events, pendingKind, pendingTrace]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const res = await fetch(apiUrl("/api/session"), { method: "POST" });
    if (!res.ok) throw new Error("Could not create session");
    const j = (await res.json()) as { session_id?: string };
    if (!j.session_id) throw new Error("Bad session response");
    setSessionId(j.session_id);
    return j.session_id;
  }, [sessionId]);

  const navigate = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setFetchError(null);
    setErrorDismissed(false);
    let sid: string;
    try {
      sid = await ensureSession();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Could not start session.");
      return;
    }
    const client_trace = crypto.randomUUID();
    setPendingTrace(client_trace);
    setPendingKind("gen");
    setGenPending(true);
    try {
      const res = await fetch(apiUrl("/api/navigate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          query: q,
          client_trace,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        let msg = "Could not start generation.";
        try {
          const j = JSON.parse(body) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          if (body.trim()) msg = body.slice(0, 200);
        }
        throw new Error(msg);
      }
    } catch (e) {
      console.error(e);
      setFetchError(e instanceof Error ? e.message : "Network error — try again.");
      setGenPending(false);
      setPendingTrace(null);
      setPendingKind(null);
    }
  }, [ensureSession, query]);

  const onSketchCommit = useCallback(
    async (region: { cx_px: number; cy_px: number; r_px: number; img_w: number; img_h: number }) => {
      if (!sessionId || !page) return;
      setFetchError(null);
      setErrorDismissed(false);
      const client_trace = crypto.randomUUID();
      setPendingTrace(client_trace);
      setPendingKind("region");
      setRegionBusy(true);
      try {
        const anchor_query = (page.anchor_query ?? query.trim()).slice(0, 400);
        const res = await fetch(apiUrl("/api/region"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            image_url: page.image_url,
            page_query: page.query,
            anchor_query,
            client_trace,
            ...region,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          let msg = "Could not refine from sketch.";
          try {
            const j = JSON.parse(body) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            if (body.trim()) msg = body.slice(0, 200);
          }
          setFetchError(msg);
          setRegionBusy(false);
          setPendingTrace(null);
          setPendingKind(null);
        }
      } catch (e) {
        console.error(e);
        setFetchError(e instanceof Error ? e.message : "Network error — try again.");
        setRegionBusy(false);
        setPendingTrace(null);
        setPendingKind(null);
      }
    },
    [page, query, sessionId],
  );

  const locked = genPending || regionBusy;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void navigate();
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void navigate();
    }
  };

  const onSketchRejected = useCallback(
    (reason: "too_short" | "too_small") => {
      if (reason === "too_short") {
        showHint("Keep drawing a little longer around the area you want to explore.");
      } else {
        showHint("Make a larger loop around the subject — sketch a bit bigger.");
      }
    },
    [showHint],
  );

  return (
    <div className="page">
      <header className="search-strip">
        <form className="search-form" onSubmit={onSubmit} role="search" aria-label="Search">
          <div className="search-pill">
            <input
              className="search-input"
              type="text"
              name="q"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Describe the page or image you want"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              disabled={locked}
              aria-label="Search query"
            />
            <button type="submit" className="search-cta" disabled={locked || !query.trim()} aria-label="Search">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </form>
      </header>

      {bannerError ? (
        <div className="error-banner" role="alert">
          <p className="error-banner-text">{bannerError}</p>
          <button type="button" className="error-banner-dismiss" onClick={() => setErrorDismissed(true)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      ) : null}

      <div ref={errLiveRef} className="sr-error" role="status" aria-live="polite" />

      <main className="canvas" aria-busy={locked}>
        {!page && !genPending ? (
          <div className="empty-canvas">
            <p className="empty-title">Start with a description</p>
            <p className="empty-body">
              Type what you want to see, submit, then <strong>sketch on the image</strong> with your pointer to zoom or branch
              the story.
            </p>
          </div>
        ) : null}
        {page ? (
          <div className="stage">
            <img ref={imgRef} src={page.image_url} alt={page.title} />
            <SketchOverlay
              imgRef={imgRef}
              disabled={locked}
              onCommit={onSketchCommit}
              onStrokeRejected={onSketchRejected}
            />
          </div>
        ) : null}
        {transientHint ? (
          <div className="hint-toast" role="status">
            {transientHint}
          </div>
        ) : null}
      </main>
    </div>
  );
}
