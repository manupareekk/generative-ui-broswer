import sharp from "sharp";
import { geminiApiKey } from "./geminiKey.js";
import { extractJsonObject } from "./jsonExtract.js";
import type { PageHotspot } from "./hotspotStore.js";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeRect(
  r: { x?: unknown; y?: unknown; w?: unknown; h?: unknown },
): { x: number; y: number; w: number; h: number } | null {
  const x = typeof r.x === "number" ? r.x : Number(r.x);
  const y = typeof r.y === "number" ? r.y : Number(r.y);
  const w = typeof r.w === "number" ? r.w : Number(r.w);
  const h = typeof r.h === "number" ? r.h : Number(r.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0) return null;
  const nx = clamp01(x);
  const ny = clamp01(y);
  const nw = clamp01(w);
  const nh = clamp01(h);
  const cx = Math.min(nx + nw, 1);
  const cy = Math.min(ny + nh, 1);
  return { x: nx, y: ny, w: Math.max(0.01, cx - nx), h: Math.max(0.01, cy - ny) };
}

/**
 * One vision pass over the **current page bitmap** to propose discrete tap targets
 * (Flipbook-style graph edges). Same image + same id → same `next_query` until this page is replaced.
 */
export async function detectHotspots(
  imagePng: Buffer,
  context: { titleHint?: string; anchorHint?: string },
): Promise<PageHotspot[]> {
  const apiKey = geminiApiKey();
  if (!apiKey) return [];

  const meta = await sharp(imagePng).metadata();
  const iw = meta.width ?? 0;
  const ih = meta.height ?? 0;
  if (iw < 32 || ih < 32) return [];

  const model = process.env.GEMINI_HOTSPOT_MODEL || process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const title = (context.titleHint ?? "").trim().slice(0, 200);
  const anchor = (context.anchorHint ?? "").trim().slice(0, 400);

  const instruction =
    `You are labeling **tap targets** on this single infographic / map / poster image (full bitmap).\n` +
    `Page title hint: ${title || "(none)"}\n` +
    `User search scope hint: ${anchor || "(none)"}\n\n` +
    `Return ONLY JSON (no markdown) of the form:\n` +
    `{"hotspots":[{"id":"kebab-case-unique-id","label":"Short UI label","next_query":"Self-contained image prompt for ONE flipbook drill-down page if the user taps this target only. One dominant focal, ≤2 side fact panels; forbid unrelated collage.","rect":{"x":0,"y":0,"w":0.2,"h":0.15}}]}\n` +
    `Rules:\n` +
    `- **3 to 8** hotspots. Each **rect** uses **normalized coordinates** of the **full image** (origin top-left): x,y,w,h all in **[0,1]** (w,h are width/height as fraction of image width/height).\n` +
    `- Boxes should tightly wrap one salient element (icon, map region, photo inset, headline block, wheel emblem, etc.).\n` +
    `- **id** must be unique, lowercase, use letters/digits/underscore only (no spaces).\n` +
    `- **next_query** must be deterministic for this id: same structure every time for the same visual target (fixed sections, fixed role of the focal).\n` +
    `- Do not invent hotspots over empty margins only.\n`;

  const dataB64 = imagePng.toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "image/png", data: dataB64 } }, { text: instruction }],
        },
      ],
    }),
  });

  if (!res.ok) return [];

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") ?? "";

  try {
    const parsed = extractJsonObject(text) as { hotspots?: unknown };
    const raw = parsed.hotspots;
    if (!Array.isArray(raw)) return [];

    const out: PageHotspot[] = [];
    const seen = new Set<string>();

    for (const row of raw) {
      if (out.length >= 8) break;
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim().replace(/\s+/g, "_").slice(0, 64) : "";
      const label = typeof o.label === "string" ? o.label.trim().slice(0, 120) : "";
      const next_query =
        typeof o.next_query === "string"
          ? o.next_query.trim()
          : typeof o.nextQuery === "string"
            ? o.nextQuery.trim()
            : "";
      const rect = normalizeRect((o.rect ?? {}) as Record<string, unknown>);
      if (!id || !label || !next_query || !rect) continue;
      if (!/^[a-z0-9_-]+$/.test(id)) continue;
      const lk = id.toLowerCase();
      if (seen.has(lk)) continue;
      seen.add(lk);
      out.push({ id: lk, label, next_query: next_query.slice(0, 4500), rect });
    }
    return out;
  } catch {
    return [];
  }
}
