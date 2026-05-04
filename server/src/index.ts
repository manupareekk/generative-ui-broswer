import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { publish, subscribe, type StreamEvent } from "./bus.js";
import { generatePage } from "./ai.js";
import { resolveTapIntent } from "./hotspots.js";

const PORT = Number(process.env.PORT || 3001);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

function writeSse(res: express.Response, event: StreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.post("/api/session", (_req, res) => {
  const session_id = `session_${crypto.randomUUID()}`;
  res.json({ session_id });
});

app.get("/api/stream/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSse(res, { type: "session_started", session_id: sessionId });

  const unsubscribe = subscribe(sessionId, (ev) => {
    writeSse(res, ev);
  });

  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

app.post("/api/tap", (req, res) => {
  const session_id = String(req.body?.session_id || "");
  const image_url = String(req.body?.image_url || "");
  const page_query = String(req.body?.page_query || "");
  const x = Number(req.body?.x);
  const y = Number(req.body?.y);
  if (!session_id || !image_url.trim()) {
    res.status(400).json({ error: "session_id and image_url are required" });
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    res.status(400).json({ error: "x and y must be numbers" });
    return;
  }

  res.status(202).json({ ok: true });

  void (async () => {
    try {
      publish(session_id, {
        type: "phase",
        phase: "tap",
        detail: "Resolving click target (Flipbook-style tap_subject)",
      });
      const { subject, next_query } = await resolveTapIntent(image_url, page_query, x, y);
      publish(session_id, {
        type: "tap_resolved",
        session_id,
        subject,
        next_query,
        x,
        y,
      });

      publish(session_id, {
        type: "phase",
        phase: "navigate",
        detail: "Generating next page from tap intent (tap_icon / image)",
      });

      const out = await generatePage({
        query: next_query,
        sessionId: session_id,
        onPhase: (phase, detail) => {
          publish(session_id, { type: "phase", phase, detail });
        },
        onProgress: (value) => {
          publish(session_id, { type: "progress", value });
        },
      });

      publish(session_id, {
        type: "page",
        title: out.title,
        query: next_query,
        image_url: out.image_url,
        session_id,
        image_variants: out.image_variants,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      publish(session_id, { type: "error", message });
    }
  })();
});

app.post("/api/navigate", async (req, res) => {
  const session_id = String(req.body?.session_id || "");
  const query = String(req.body?.query || "");
  if (!session_id || !query.trim()) {
    res.status(400).json({ error: "session_id and query are required" });
    return;
  }

  res.status(202).json({ ok: true });

  void (async () => {
    try {
      const out = await generatePage({
        query,
        sessionId: session_id,
        onPhase: (phase, detail) => {
          publish(session_id, { type: "phase", phase, detail });
        },
        onProgress: (value) => {
          publish(session_id, { type: "progress", value });
        },
      });

      publish(session_id, {
        type: "page",
        title: out.title,
        query,
        image_url: out.image_url,
        session_id,
        image_variants: out.image_variants,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      publish(session_id, { type: "error", message });
    }
  })();
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/ws" });

wss.on("connection", (socket, req) => {
  const url = new URL(req.url || "", "http://localhost");
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    socket.close(1008, "sessionId required");
    return;
  }

  socket.send(JSON.stringify({ type: "session_started", session_id: sessionId } satisfies StreamEvent));

  const unsubscribe = subscribe(sessionId, (ev) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(ev));
  });

  socket.on("close", () => unsubscribe());
});

server.listen(PORT, () => {
  console.log(`generative-ui-browser server http://localhost:${PORT}`);
});
