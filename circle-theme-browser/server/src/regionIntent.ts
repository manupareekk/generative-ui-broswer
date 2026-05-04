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

/**
 * Vision step: user sketched a region on the current image (client sends enclosing circle); return subject + standalone next image prompt.
 */
export async function resolveRegionIntent(
  imageUrl: string,
  pageQuery: string,
  themeBlock: string,
  region: RegionCircle,
  opts?: { anchorQuery?: string },
): Promise<{ subject: string; next_query: string }> {
  const { cx_px, cy_px, r_px, img_w, img_h } = region;
  const x = clamp01(cx_px / Math.max(1, img_w));
  const y = clamp01(cy_px / Math.max(1, img_h));
  const rNorm = r_px / Math.max(1, Math.min(img_w, img_h));

  const fallback = {
    subject: "sketched region",
    next_query:
      `${themeBlock}\n\n` +
      `Previous image intent: ${pageQuery.slice(0, 1200)}\n` +
      `The user pencil-sketched an area on that image; we summarize it as a circle: center ≈ (${Math.round(x * 100)}%, ${Math.round(y * 100)}%) ` +
      `of the frame, radius ≈ ${(rNorm * 100).toFixed(1)}% of the shorter side.\n` +
      `Generate ONE new full-frame image that continues the story: zoom into, open, or reveal what that sketch targeted. ` +
      `Composition priority: about 75% of the frame should be about the sketched subject/area, and about 25% can preserve context from the previous page so continuity remains clear. ` +
      `Keep the same world and theme, modern search-style discovery, and coherent structure (not a pasted SERP collage). ` +
      `On-image text is fine (headlines, bullets, map labels, captions) when it clarifies the scene; spell carefully and keep type legible. ` +
      `No scrollbars, no nested scroll UI, no fake browser chrome around the art unless the user explicitly wanted a device screen.`,
  };

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
    ? `**User search (short — keep subject + next image inside this scope):** ${anchor.slice(0, 400)}\n` +
      `Do not jump to a different country, trip, or city unless the bitmap clearly centers that place; prefer combining this scope with what lies inside the sketch circle.\n\n`
    : "";

  const instruction =
    `You are analyzing a generated image (full-frame bitmap).\n` +
    anchorBlock +
    `Global theme (must carry forward): ${themeBlock.slice(0, 2500)}\n` +
    `Previous generation prompt / intent: ${pageQuery.slice(0, 2000)}\n\n` +
    `The user drew a **freehand pencil sketch** on this image; the client sends the **minimum circle** that encloses that sketch, in **pixel coordinates** ` +
    `(origin top-left of the bitmap): center=(${Math.round(cx_px)}, ${Math.round(cy_px)}), radius=${Math.round(
      r_px,
    )} px, image size=${Math.round(img_w)}×${Math.round(img_h)} px.\n` +
    `Rough normalized center (for sanity): x=${x.toFixed(3)}, y=${y.toFixed(3)} (0–1).\n\n` +
    `Return ONLY JSON (no markdown) of the form:\n` +
    `{"subject":"short phrase naming what they sketched toward","next_query":"one detailed prompt for an image model to render the NEXT full-frame image after focusing on that region"}\n` +
    `next_query must be self-contained and must include the same visual theme constraints; describe the new scene to synthesize (do not say "the previous image"). ` +
    `next_query must also: (1) synthesize holistically what that subject implies in context (like a rounded "top results" understanding, one coherent scene), ` +
    `(2) make the next image mostly about the sketched region (roughly 70-85% of frame focus) while retaining limited context from the prior scene (roughly 15-30%) for continuity, ` +
    `(3) favor multiple plausible objects or regions the user could tap/sketch next, and (4) allow readable on-image typography when helpful; spell-check proper nouns; avoid only illegible micro-type, ` +
    `and (5) forbid scrollbars, feed-scroll metaphors, and fake browser/OS framing unless the original user intent explicitly required a realistic screen.`;

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
    const parsed = extractJsonObject(text) as { subject?: unknown; next_query?: unknown; nextQuery?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const next_query =
      typeof parsed.next_query === "string"
        ? parsed.next_query.trim()
        : typeof parsed.nextQuery === "string"
          ? parsed.nextQuery.trim()
          : "";
    if (!next_query) return fallback;
    return { subject: subject || fallback.subject, next_query };
  } catch {
    return fallback;
  }
}
