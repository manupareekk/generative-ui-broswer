export type GenerateInput = {
  query: string;
  sessionId: string;
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

function svgPage(title: string, query: string): string {
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
    .slice(0, 18)
    .map((line, i) => {
      const y = 170 + i * 26;
      return `<text x="80" y="${y}" fill="#cbd5e1" font-family="ui-sans-serif, system-ui" font-size="18">${esc(
        line || " ",
      )}</text>`;
    })
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="640" viewBox="0 0 1024 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="640" fill="url(#g)"/>
  <rect x="48" y="48" width="928" height="544" rx="18" fill="#0b1220" stroke="#334155" stroke-width="2"/>
  <text x="80" y="120" fill="#e2e8f0" font-family="ui-sans-serif, system-ui" font-size="28" font-weight="700">${esc(
    title,
  )}</text>
  ${body}
  <text x="80" y="600" fill="#64748b" font-family="ui-monospace, monospace" font-size="14">generative-browser · stub frame (set GEMINI_API_KEY or OPENAI_API_KEY)</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function geminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    null
  );
}

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

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

/**
 * Gemini Developer API image output (see Gemini API image generation docs).
 * Model id is configurable because Google ships frequent preview renames.
 */
async function geminiImage(query: string, onProgress: (n: number) => void): Promise<string> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  onProgress(50);

  const prompt =
    `Create ONE polished, high-resolution image that looks like a full-screen UI mock / web page for this request.\n` +
    `No UI chrome explanation — just the visual page itself.\n\n` +
    query.slice(0, 4000);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

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
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "16:9",
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

  const parts = json.candidates?.[0]?.content?.parts;
  const dataUrl = firstInlineImageDataUrl(parts);
  if (!dataUrl) throw new Error("Gemini response contained no inline image data");
  onProgress(92);
  return dataUrl;
}

async function openaiImage(query: string, onProgress: (n: number) => void): Promise<string> {
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
      prompt: query.slice(0, 4000),
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

/**
 * Flipbook-like pipeline: stream phases to the client, then return a raster "page".
 * Provider order: Gemini (GEMINI_API_KEY / GOOGLE_API_KEY) → OpenAI → SVG stub.
 */
export async function generatePage(input: GenerateInput): Promise<GenerateOutput> {
  const { query, onPhase, onProgress } = input;
  const title = query.trim().slice(0, 80) || "Untitled";

  onPhase("parse", "Turning your request into a visual brief");
  onProgress(5);
  await sleep(180);

  onPhase("layout", "Choosing composition (no HTML — bitmap output only)");
  onProgress(18);
  await sleep(220);

  onPhase("render", "Synthesizing the page image");
  onProgress(32);
  await sleep(200);

  let image_url: string;
  try {
    if (geminiApiKey()) {
      image_url = await geminiImage(query, onProgress);
    } else if (process.env.OPENAI_API_KEY) {
      image_url = await openaiImage(query, onProgress);
    } else {
      onProgress(60);
      await sleep(160);
      image_url = svgPage(title, query);
      onProgress(95);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    image_url = svgPage("Error", message);
    onProgress(100);
  }

  const thumb = svgPage(`${title} · thumb`, query.slice(0, 400));
  onProgress(100);

  return {
    title,
    image_url,
    image_variants: {
      thumb,
    },
  };
}
