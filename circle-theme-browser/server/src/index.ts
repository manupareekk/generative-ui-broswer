import "./load-env.js";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { publish, subscribe, type StreamEvent } from "./bus.js";
import type { ReferenceImage } from "./ai.js";
import { compileNavigateScene, compileRegionScene } from "./compileScene.js";
import { generatePage } from "./ai.js";
import { cropSquareAround, loadImageBufferFromUrl, toPngReference } from "./imageRef.js";
import { resolveRegionIntent } from "./regionIntent.js";
import { retrieveSnippets, snippetsToDigest } from "./retrieveWeb.js";
import { DEFAULT_THEME_KEY, resolveThemeBlock, THEME_PRESETS } from "./themes.js";

const PORT = Number(process.env.CIRCLE_BROWSER_PORT || process.env.PORT || 3020);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "18mb" }));

function geminiConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim(),
  );
}

function writeSse(res: express.Response, event: StreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "generative-ui-browser",
    gemini_image_configured: geminiConfigured(),
    brave_search_configured: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
  });
});

app.get("/api/themes", (_req, res) => {
  res.json({ presets: Object.keys(THEME_PRESETS), default: DEFAULT_THEME_KEY });
});

app.post("/api/session", (_req, res) => {
  const session_id = `ctb_${crypto.randomUUID()}`;
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

function themeFromBody(body: express.Request["body"]): string {
  const presetRaw = String(body?.theme_preset ?? "");
  const preset = presetRaw in THEME_PRESETS ? presetRaw : DEFAULT_THEME_KEY;
  const theme_custom = String(body?.theme_custom || "");
  return resolveThemeBlock(preset, theme_custom);
}

app.post("/api/navigate", (req, res) => {
  const session_id = String(req.body?.session_id || "");
  const query = String(req.body?.query || "");
  const client_trace = String(req.body?.client_trace || "").trim() || undefined;
  if (!session_id || !query.trim()) {
    res.status(400).json({ error: "session_id and query are required" });
    return;
  }

  const themeBlock = themeFromBody(req.body);

  res.status(202).json({ ok: true });

  void (async () => {
    try {
      publish(session_id, {
        type: "phase",
        phase: "retrieve",
        detail: "Gathering lightweight web snippets for your query",
      });
      const snippets = await retrieveSnippets(query);
      const digest = snippetsToDigest(snippets);

      publish(session_id, {
        type: "phase",
        phase: "compile",
        detail: "Compiling scene brief + spell-checked labels",
      });
      const { compiledQuery, titleHint } = await compileNavigateScene({
        userQuery: query,
        themeBlock,
        retrievalDigest: digest,
      });

      const out = await generatePage({
        query: compiledQuery,
        themeBlock,
        sessionId: session_id,
        titleHint,
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
        query: compiledQuery,
        image_url: out.image_url,
        session_id,
        image_variants: out.image_variants,
        client_trace,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      publish(session_id, { type: "error", message, client_trace });
    }
  })();
});

app.post("/api/region", (req, res) => {
  const session_id = String(req.body?.session_id || "");
  const client_trace = String(req.body?.client_trace || "").trim() || undefined;
  const image_url = String(req.body?.image_url || "");
  const page_query = String(req.body?.page_query || "");
  const cx_px = Number(req.body?.cx_px);
  const cy_px = Number(req.body?.cy_px);
  const r_px = Number(req.body?.r_px);
  const img_w = Number(req.body?.img_w);
  const img_h = Number(req.body?.img_h);

  if (!session_id || !image_url.trim()) {
    res.status(400).json({ error: "session_id and image_url are required" });
    return;
  }
  if (![cx_px, cy_px, r_px, img_w, img_h].every((n) => Number.isFinite(n) && n > 0)) {
    res.status(400).json({ error: "cx_px, cy_px, r_px, img_w, img_h must be positive numbers" });
    return;
  }
  if (r_px < 4) {
    res.status(400).json({ error: "sketch too small; draw a larger area" });
    return;
  }

  const themeBlock = themeFromBody(req.body);

  res.status(202).json({ ok: true });

  void (async () => {
    try {
      publish(session_id, {
        type: "phase",
        phase: "region",
        detail: "Resolving what you sketched (vision → next prompt)",
      });

      const { subject, next_query } = await resolveRegionIntent(image_url, page_query, themeBlock, {
        cx_px,
        cy_px,
        r_px,
        img_w,
        img_h,
      });

      publish(session_id, {
        type: "region_resolved",
        session_id,
        subject,
        next_query,
        cx_px,
        cy_px,
        r_px,
      });

      publish(session_id, {
        type: "phase",
        phase: "retrieve",
        detail: "Gathering lightweight web snippets for sketch focus",
      });
      const snippets = await retrieveSnippets(page_query, subject);
      const digest = snippetsToDigest(snippets);

      publish(session_id, {
        type: "phase",
        phase: "compile",
        detail: "Compiling next scene + spell-checked labels",
      });
      const { compiledQuery, titleHint } = await compileRegionScene({
        pageQuery: page_query,
        subject,
        visionNextQuery: next_query,
        themeBlock,
        retrievalDigest: digest,
      });

      publish(session_id, {
        type: "phase",
        phase: "render",
        detail: "Generating next image from sketched region",
      });

      let referenceImages: ReferenceImage[] | undefined;
      if (geminiConfigured()) {
        try {
          const buf = await loadImageBufferFromUrl(image_url);
          const full = await toPngReference(buf, 1536);
          const cropBuf = await cropSquareAround(buf, cx_px, cy_px, r_px);
          const crop = await toPngReference(cropBuf, 1024);
          referenceImages = [full, crop];
        } catch (e) {
          console.error("[generative-ui-browser] reference images:", e);
          referenceImages = undefined;
        }
      }

      const out = await generatePage({
        query: compiledQuery,
        themeBlock,
        sessionId: session_id,
        titleHint,
        referenceImages,
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
        query: compiledQuery,
        image_url: out.image_url,
        session_id,
        image_variants: out.image_variants,
        client_trace,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      publish(session_id, { type: "error", message, client_trace });
    }
  })();
});

app.listen(PORT, () => {
  const key = geminiConfigured();
  console.log(`generative-ui-browser API http://127.0.0.1:${PORT}`);
  console.log(
    key
      ? "Gemini / Google image key: loaded (native image generation enabled)."
      : "Gemini / Google image key: MISSING — set GEMINI_API_KEY in .env next to package.json (SVG stub only).",
  );
});
