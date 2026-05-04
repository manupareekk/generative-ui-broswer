import sharp from "sharp";
import { geminiApiKey } from "./geminiKey.js";

export type ReferenceImage = { mimeType: string; dataBase64: string };

export type GenerateInput = {
  query: string;
  /** Prepended to every provider prompt so all frames share one visual theme. */
  themeBlock: string;
  sessionId: string;
  /** Overrides title derived from query (e.g. short subject from compiler). */
  titleHint?: string;
  /** Optional reference bitmaps for Gemini image conditioning (full frame + crop). */
  referenceImages?: ReferenceImage[];
  onPhase: (phase: string, detail?: string) => void;
  onProgress: (value: number) => void;
};

export type GenerateOutput = {
  title: string;
  image_url: string;
  image_variants?: Record<string, string>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Prepended to every image brief (navigate + region). Not literal web search — steers the model toward a rounded synthesis. */
const HOLISTIC_FRAME_RULES =
  "Holistic topic synthesis: Treat the user's text like a search query. Render ONE coherent full-frame scene that merges the main themes, entities, and settings a careful reader would expect from strong first-page-style sources—one unified world, not unrelated snippets, not a pasted collage of SERP thumbnails.\n\n" +
  "Interaction & layout: The vibe is modern discovery (search-engine clarity without simulating a browser): tap/sketch explores the image. Prefer a **single dominant focal graphic** (often a clean stylized map or one hero illustration) with **generous whitespace**, then **a few** (roughly 3–7) scannable satellites—floating stat cards, thin-line icons with short labels, and **small circular photo insets** pinned to relevant spots—not a crowded textbook poster that packs unrelated vignettes edge-to-edge. If you show a map, keep it legible and centered in importance; callouts attach to it with subtle connectors. Stay contemporary and bright; avoid medieval, ornate manuscript, or fairytale styling unless the query requires it. Do NOT depict scrollbars, infinite feeds, fake OS dialogs, “draft version” toasts, fake window chrome, or address bars unless the user explicitly asked for a realistic device screen.\n\n" +
  "Typography: on-image text is fine when it helps the scene (headlines, short bullets, map labels, captions). Keep hierarchy clear, type large enough to read, and spell carefully—especially proper nouns and place names. Balance text with photography, maps, icons, and diagrams; avoid illegible micro-type.";

function combinePrompt(themeBlock: string, userQuery: string): string {
  const t = themeBlock.trim();
  const q = userQuery.trim();
  const body = `---\n\nScene / content request:\n${q}`;
  if (!t) return `${HOLISTIC_FRAME_RULES}\n\n${body}`;
  return `${t}\n\n${HOLISTIC_FRAME_RULES}\n\n${body}`;
}

function svgPage(title: string, query: string, themeHint: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const lines = query.split(/\r?\n/).flatMap((l) => {
    const chunks: string[] = [];
    for (let i = 0; i < l.length; i += 72) chunks.push(l.slice(i, i + 72));
    if (chunks.length === 0) chunks.push("");
    return chunks;
  });
  const body = lines
    .slice(0, 14)
    .map((line, i) => {
      const y = 188 + i * 22;
      return `<text x="48" y="${y}" fill="#3d3d3d" font-family="ui-sans-serif, system-ui" font-size="15">${esc(
        line || " ",
      )}</text>`;
    })
    .join("");
  const themeLines = themeHint
    .slice(0, 280)
    .split(/\r?\n/)
    .flatMap((l) => {
      const c: string[] = [];
      for (let i = 0; i < l.length; i += 80) c.push(l.slice(i, i + 80));
      return c;
    })
    .slice(0, 4)
    .map(
      (line, i) =>
        `<text x="48" y="${112 + i * 17}" fill="#737373" font-family="ui-sans-serif, system-ui" font-size="12">${esc(
          line || " ",
        )}</text>`,
    )
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640">
  <rect width="1024" height="640" fill="#f5f5f3"/>
  <rect x="0" y="0" width="1024" height="1" fill="#e5e4e0"/>
  <text x="48" y="72" fill="#141414" font-family="ui-sans-serif, system-ui" font-size="26" font-weight="700">${esc(
    title,
  )}</text>
  ${themeLines}
  ${body}
  <text x="48" y="612" fill="#9a9a9a" font-family="ui-monospace, monospace" font-size="11">Stub preview (no API keys) — set GEMINI_API_KEY or OPENAI_API_KEY for real images.</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

/** Mild sharpen on PNG data URLs so UI/text reads crisper (set GEMINI_IMAGE_SHARPEN=0 to skip). */
async function touchUpImageDataUrl(dataUrl: string): Promise<string> {
  if (process.env.GEMINI_IMAGE_SHARPEN === "0") return dataUrl;
  if (!dataUrl.startsWith("data:image/png")) return dataUrl;
  const m = dataUrl.match(/^data:image\/png;base64,([\s\S]+)$/i);
  if (!m) return dataUrl;
  try {
    const buf = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
    const out = await sharp(buf).rotate().sharpen({ sigma: 0.55 }).png({ compressionLevel: 7 }).toBuffer();
    return `data:image/png;base64,${out.toString("base64")}`;
  } catch (e) {
    console.warn("[generative-ui-browser] touchUpImageDataUrl:", e);
    return dataUrl;
  }
}

function firstInlineImageDataUrl(parts: GeminiPart[] | undefined): string | null {
  if (!parts) return null;
  for (const p of parts) {
    const id = p.inlineData ?? p.inline_data;
    if (!id?.data) continue;
    const mime = p.inlineData?.mimeType ?? p.inline_data?.mime_type ?? "image/png";
    return `data:${mime};base64,${id.data}`;
  }
  return null;
}

async function geminiImage(
  fullPrompt: string,
  onProgress: (n: number) => void,
  referenceImages?: ReferenceImage[],
): Promise<string> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  onProgress(50);

  const lead =
    `Create ONE polished, high-resolution image that matches the following brief.\n` +
    `Output only the final artwork — no caption, no border, no browser window, no scrollbar chrome, no explanatory panels around it.\n` +
    `Rendering: crisp readable type at intended sizes, clean vector-like edges on UI shapes, coherent soft lighting, subtle depth and shadows, sharp focus on foreground elements, no watermarks, no muddy compression look.\n` +
    (referenceImages?.length
      ? `Reference image(s) are attached: preserve continuity (palette, lighting, materials, world) with the prior frame; if two images are present, the second is a zoomed crop of what the user sketched—make that the primary focus while staying coherent.\n\n`
      : "\n");

  const prompt = `${lead}${fullPrompt.slice(0, 7500)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const parts: GeminiPart[] = [];
  if (referenceImages?.length) {
    for (const ref of referenceImages) {
      parts.push({
        inlineData: { mimeType: ref.mimeType, data: ref.dataBase64 },
      });
    }
  }
  parts.push({ text: prompt });

  const sizeRaw = (process.env.GEMINI_IMAGE_SIZE || "2K").trim().toUpperCase();
  const imageSize = ["1K", "2K", "4K"].includes(sizeRaw) ? sizeRaw : "2K";

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
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "16:9",
          imageSize,
        },
      },
    }),
  });

  onProgress(78);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini image error ${res.status}: ${text.slice(0, 800)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    error?: { message?: string };
  };

  if (json.error?.message) throw new Error(json.error.message);

  const partsOut = json.candidates?.[0]?.content?.parts;
  const dataUrl = firstInlineImageDataUrl(partsOut);
  if (!dataUrl) throw new Error("Gemini response contained no inline image data");
  onProgress(92);
  return dataUrl;
}

async function openaiImage(fullPrompt: string, onProgress: (n: number) => void): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  onProgress(55);
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
      prompt: fullPrompt.slice(0, 4000),
      size: "1024x1024",
      n: 1,
    }),
  });

  onProgress(85);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI images error ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  const row = json.data?.[0];
  if (row?.url) return row.url;
  if (row?.b64_json) return `data:image/png;base64,${row.b64_json}`;
  throw new Error("OpenAI response missing image data");
}

export async function generatePage(input: GenerateInput): Promise<GenerateOutput> {
  const { query, themeBlock, titleHint, referenceImages, onPhase, onProgress } = input;
  const fullPrompt = combinePrompt(themeBlock, query);
  const title = (titleHint ?? query).trim().slice(0, 80) || "Untitled";

  onPhase("parse", "Applying theme + brief");
  onProgress(5);
  await sleep(120);

  onPhase("layout", "Composing the next frame");
  onProgress(18);
  await sleep(140);

  onPhase("render", "Synthesizing image");
  onProgress(32);
  await sleep(120);

  let image_url: string;
  try {
    if (geminiApiKey()) {
      const raw = await geminiImage(fullPrompt, onProgress, referenceImages);
      image_url = await touchUpImageDataUrl(raw);
    } else if (process.env.OPENAI_API_KEY) {
      image_url = await openaiImage(fullPrompt, onProgress);
    } else {
      onProgress(60);
      await sleep(120);
      image_url = svgPage(title, query, themeBlock);
      onProgress(95);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    console.error("[generative-ui-browser] generatePage:", message);
    onProgress(100);
    throw new Error(message);
  }

  const thumb = svgPage(`${title} · thumb`, query.slice(0, 400), themeBlock.slice(0, 200));
  onProgress(100);

  return {
    title,
    image_url,
    image_variants: {
      thumb,
    },
  };
}
