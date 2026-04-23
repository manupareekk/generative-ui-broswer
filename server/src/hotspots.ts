function geminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    null
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
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

/**
 * Flipbook-style tap: user clicked at normalized (x,y) on the current page image.
 * Vision model returns a short subject label + a full next-screen image prompt.
 */
export async function resolveTapIntent(
  imageUrl: string,
  pageQuery: string,
  nx: number,
  ny: number,
): Promise<{ subject: string; next_query: string }> {
  const x = clamp01(nx);
  const y = clamp01(ny);
  const apiKey = geminiApiKey();
  const fallback = {
    subject: "selected region",
    next_query:
      `The user clicked at approximately (${Math.round(x * 100)}%, ${Math.round(y * 100)}%) on the current UI screenshot. ` +
      `Generate the next screen that would logically result from activating whatever control or content is there. ` +
      `Keep continuity with this page intent: ${pageQuery.slice(0, 500)}`,
  };

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

  const instruction =
    `You are analyzing a UI screenshot.\n` +
    `Page intent / caption: ${pageQuery.slice(0, 2000)}\n` +
    `The user clicked at normalized coordinates: x=${x.toFixed(3)}, y=${y.toFixed(3)} ` +
    `(0,0 is top-left of the image; 1,1 is bottom-right).\n\n` +
    `Return ONLY JSON (no markdown) of the form:\n` +
    `{"subject":"short phrase naming what they likely clicked","next_query":"one detailed prompt for an image model to render the NEXT full-screen UI after this click"}\n` +
    `next_query must stand alone (do not refer to "the image" — describe the new UI to synthesize).`;

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
          parts: [
            { inlineData: { mimeType: mime, data } },
            { text: instruction },
          ],
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
