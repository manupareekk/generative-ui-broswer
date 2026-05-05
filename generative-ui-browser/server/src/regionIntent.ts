import { geminiApiKey } from "./geminiKey.js";
import { extractJsonObject } from "./jsonExtract.js";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

async function dataUrlToBase64(dataUrl: string): Promise<{ mime: string; data: string }> {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!m) throw new Error("Unsupported data URL");
  const mime = m[1] || "application/octet-stream";
  const isBase64 = Boolean(m[2]);
  const payload = m[3] ?? "";
  if (isBase64) return { mime, data: payload.replace(/\s+/g, "") };

  const decoded = decodeURIComponent(payload);
  return { mime, data: Buffer.from(decoded, "utf8").toString("base64") };
}

async function remoteImageToBase64(url: string): Promise<{ mime: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 4_500_000) throw new Error("Image too large for vision");
  return { mime, data: buf.toString("base64") };
}

async function resolveImageForVision(imageUrl: string): Promise<{ mime: string; data: string }> {
  if (imageUrl.startsWith("data:")) return dataUrlToBase64(imageUrl);
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return remoteImageToBase64(imageUrl);
  throw new Error("Unsupported image URL for vision");
}

export type RegionCircle = {
  cx_px: number;
  cy_px: number;
  r_px: number;
  img_w: number;
  img_h: number;
};

/** One discrete “Flipbook node” the user can open from a tap (label + full image brief). */
export type RegionIntentRoute = {
  label: string;
  next_query: string;
};

function buildFallbackRoutes(
  themeBlock: string,
  pageQuery: string,
  x: number,
  y: number,
  rNorm: number,
): { subject: string; next_query: string; routes: RegionIntentRoute[] } {
  const subject = "tapped region";
  const next_query =
    `${themeBlock}\n\n` +
    `Previous image intent: ${pageQuery.slice(0, 1200)}\n` +
    `The user tapped an area on that image; we summarize it as a circle: center ≈ (${Math.round(x * 100)}%, ${Math.round(y * 100)}%) ` +
    `of the frame, radius ≈ ${(rNorm * 100).toFixed(1)}% of the shorter side.\n` +
    `Generate ONE new full-frame image that continues the story: zoom into, open, or reveal what that tap targeted. ` +
    `Composition priority: about 75% of the frame should be about the tapped subject/area, and about 25% can preserve context from the previous page so continuity remains clear. ` +
    `Keep the same world and theme, modern search-style discovery, and coherent structure (not a pasted SERP collage). ` +
    `On-image text is fine (headlines, bullets, map labels, captions) when it clarifies the scene; spell carefully and keep type legible. ` +
    `No scrollbars, no nested scroll UI, no fake browser chrome around the art unless the user explicitly wanted a device screen.`;
  return { subject, next_query, routes: [{ label: subject, next_query }] };
}

function normalizeRoutes(
  parsed: Record<string, unknown>,
  subject: string,
  next_query: string,
): RegionIntentRoute[] {
  const raw = parsed.routes;
  if (!Array.isArray(raw)) {
    return [{ label: subject || "This tap", next_query }];
  }
  const out: RegionIntentRoute[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const nq =
      typeof o.next_query === "string"
        ? o.next_query.trim()
        : typeof o.nextQuery === "string"
          ? o.nextQuery.trim()
          : "";
    if (!label || !nq) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: label.slice(0, 120), next_query: nq.slice(0, 4000) });
    if (out.length >= 4) break;
  }
  if (out.length === 0) return [{ label: subject || "This tap", next_query }];
  return out;
}

/**
 * Vision: infer tap target + discrete **routes** (Flipbook-style graph).
 * Each route is one topic page only—not a random collage.
 */
export async function resolveRegionIntentRoutes(
  imageUrl: string,
  pageQuery: string,
  themeBlock: string,
  region: RegionCircle,
  opts?: { anchorQuery?: string },
): Promise<{ subject: string; next_query: string; routes: RegionIntentRoute[] }> {
  const { cx_px, cy_px, r_px, img_w, img_h } = region;
  const x = clamp01(cx_px / Math.max(1, img_w));
  const y = clamp01(cy_px / Math.max(1, img_h));
  const rNorm = r_px / Math.max(1, Math.min(img_w, img_h));

  const fallback = buildFallbackRoutes(themeBlock, pageQuery, x, y, rNorm);

  const apiKey = geminiApiKey();
  if (!apiKey) return fallback;

  let mime: string;
  let data: string;
  try {
    ({ mime, data } = await resolveImageForVision(imageUrl));
  } catch {
    return fallback;
  }
  if (mime.includes("svg")) return fallback;

  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const anchor = (opts?.anchorQuery ?? "").trim();
  const anchorBlock = anchor
    ? `**User search (short — all routes must stay inside this scope):** ${anchor.slice(0, 400)}\n` +
      `Do not invent routes about unrelated countries or topics outside that scope.\n\n`
    : "";

  const instruction =
    `You are analyzing a generated image (full-frame bitmap) for an interactive “flipbook” app.\n` +
    anchorBlock +
    `Global theme (must carry forward): ${themeBlock.slice(0, 2500)}\n` +
    `Previous generation prompt / intent: ${pageQuery.slice(0, 2000)}\n\n` +
    `The user **tapped** this image; the client sends a **focus circle** (center + radius in bitmap pixels) around that tap: ` +
    `center=(${Math.round(cx_px)}, ${Math.round(cy_px)}), radius=${Math.round(r_px)} px, image=${Math.round(img_w)}×${Math.round(img_h)} px ` +
    `(normalized center x=${x.toFixed(3)}, y=${y.toFixed(3)}).\n\n` +
    `Your job is like **routing taps on discrete UI targets** (even though this is a flat image): propose **2 to 4 mutually distinct topics** the user might have meant, each opening a **dedicated explainer page** about that topic only—**not** a collage of unrelated India facts.\n` +
    `Examples: if the circle is on a wheel emblem, include a route whose label names that emblem precisely; if on a tiger illustration, routes about that animal; if ambiguous, still keep each route a **single coherent topic**.\n\n` +
    `Return ONLY JSON (no markdown) of the form:\n` +
    `{"subject":"best short name for the tap target","next_query":"draft image prompt for the BEST route (same as routes[0] intent)","routes":[{"label":"short UI label for this route","next_query":"self-contained image prompt for ONE flipbook drill-down page: one dominant central graphic/diagram for THIS label only, at most two side fact panels, optional thin annotation lines from micro-labels to the focal graphic, optional slim breadcrumb text at top, one footer line; forbid unrelated topics."},{"label":"…","next_query":"…"}]}\n` +
    `Rules:\n` +
    `- **routes** length 2–4; each **next_query** must focus **only** on that route’s label (no “also show cricket, food, and Taj” unless the label itself demands it).\n` +
    `- Put the **single best interpretation** first in **routes**; **subject** and top-level **next_query** must align with routes[0].\n` +
    `- Labels must be short (≤ 8 words), Title Case where appropriate.\n` +
    `- Forbid scrollbars, fake browser/OS UI, and “draft / continue” toasts.\n`;

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
          parts: [{ inlineData: { mimeType: mime, data } }, { text: instruction }],
        },
      ],
    }),
  });

  if (!res.ok) return fallback;

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") ?? "";

  try {
    const parsed = extractJsonObject(text) as Record<string, unknown>;
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const next_query =
      typeof parsed.next_query === "string"
        ? parsed.next_query.trim()
        : typeof parsed.nextQuery === "string"
          ? (parsed.nextQuery as string).trim()
          : "";
    const routes = normalizeRoutes(parsed, subject, next_query);
    const primaryNq = routes[0]?.next_query || next_query;
    if (!primaryNq) return fallback;
    return {
      subject: subject || routes[0].label || fallback.subject,
      next_query: next_query || primaryNq,
      routes,
    };
  } catch {
    return fallback;
  }
}

/** Back-compat: best route only. */
export async function resolveRegionIntent(
  imageUrl: string,
  pageQuery: string,
  themeBlock: string,
  region: RegionCircle,
  opts?: { anchorQuery?: string },
): Promise<{ subject: string; next_query: string }> {
  const { subject, next_query } = await resolveRegionIntentRoutes(imageUrl, pageQuery, themeBlock, region, opts);
  return { subject, next_query };
}
