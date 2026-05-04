import { geminiApiKey } from "./geminiKey.js";
import { extractJsonObject } from "./jsonExtract.js";

type CompilerJson = {
  scene_brief?: unknown;
  title_hint?: unknown;
  titleHint?: unknown;
  allowed_labels?: unknown;
  allowedLabels?: unknown;
};

const MAX_LABEL_ITEMS = 8;

function clipSceneBrief(s: string, maxChars = 1200): string {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1).trimEnd()}…`;
}

function compilerTemperature(): number {
  const raw = Number(process.env.GEMINI_COMPILER_TEMPERATURE ?? 0.22);
  if (!Number.isFinite(raw)) return 0.22;
  return Math.min(0.85, Math.max(0.05, raw));
}

function asStringArray(v: unknown, maxItems: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const s = x.replace(/\s+/g, " ").trim();
    if (!s) continue;
    const words = s.split(/\s+/).filter(Boolean);
    const clipped = words.slice(0, 12).join(" ");
    out.push(clipped);
    if (out.length >= maxItems) break;
  }
  return out;
}

async function geminiJsonText(instruction: string): Promise<string> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_COMPILER_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: instruction }] }],
      generationConfig: { temperature: compilerTemperature() },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini compiler error ${res.status}: ${t.slice(0, 600)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (json.error?.message) throw new Error(json.error.message);

  return json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") ?? "";
}

function buildCompiledUserQuery(sceneBrief: string, labels: string[], retrievalDigest: string): string {
  const labelBlock =
    labels.length > 0
      ? `Suggested on-image text snippets (max ~12 words each, spell-checked, Title Case for proper names — use as headlines, labels, or captions where helpful):\n- ${labels.join("\n- ")}`
      : "On-image text is allowed: headlines, short bullets, map labels, dates, and captions when they make the scene clearer. Spell-check everything; keep type legible and hierarchically clear.";

  const retrievalBlock = retrievalDigest.trim()
    ? `Retrieval notes (may be incomplete; do not invent URLs; use only as factual guardrails):\n${retrievalDigest.trim()}`
    : "No retrieval snippets were available; rely on the scene brief and references.";

  return (
    `Scene brief (primary — follow closely):\n${sceneBrief.trim()}\n\n` +
    `${retrievalBlock}\n\n` +
    `Typography / spelling:\n` +
    `${labelBlock}\n` +
    `Balance visuals with text; avoid illegible micro-type.\n\n` +
    `Visual density:\n` +
    `Combine photography, maps, icons, charts, and readable typography as fits the brief.`
  );
}

export async function compileNavigateScene(input: {
  userQuery: string;
  themeBlock: string;
  retrievalDigest: string;
}): Promise<{ compiledQuery: string; titleHint: string }> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    const base = input.userQuery.trim();
    const d = input.retrievalDigest.trim();
    return {
      compiledQuery: d ? `${base}\n\nRetrieval notes:\n${d}` : base,
      titleHint: input.userQuery.trim().slice(0, 80) || "Untitled",
    };
  }

  const instruction =
    `You are a strict prompt compiler for an image model.\n` +
    `User search-like request:\n${input.userQuery.slice(0, 2000)}\n\n` +
    `Global visual theme (must carry forward):\n${input.themeBlock.slice(0, 2000)}\n\n` +
    `Retrieval digest (optional grounding):\n${input.retrievalDigest.slice(0, 6000)}\n\n` +
    `Return ONLY JSON (no markdown) of the form:\n` +
    `{"scene_brief":"…","title_hint":"<=80 chars","allowed_labels":["<=12 words each","… up to ${MAX_LABEL_ITEMS} items"]}\n` +
    `Rules:\n` +
    `- scene_brief must be a single cohesive scene description for a wide 16:9 frame; keep it **under ~900 characters** (one tight paragraph + short clauses)—no encyclopedic wall of micro-detail that confuses the image model.\n` +
    `- Prefer **one dominant layout idea** (e.g. stylized map as hero, or one hero object) plus a **small** set of supporting callouts (floating cards, circular image badges, icon rows)—avoid cramming many large unrelated illustrations (separate Taj, tiger, cricket panel, etc.) that read like a school poster.\n` +
    `- Explicitly forbid fake UI: no modal toasts, no “continue with draft”, no browser or OS chrome.\n` +
    `- Spell-check all words in scene_brief and allowed_labels; fix obvious typos.\n` +
    `- allowed_labels: at most **${MAX_LABEL_ITEMS}** items (headlines, place names, map labels, short bullets); omit filler; empty array only if the scene truly needs no text.\n` +
    `- Balance maps, photography, icons, and readable typography; favor **editorial infographic** density over encyclopedia density.\n`;

  try {
    const text = await geminiJsonText(instruction);
    const parsed = extractJsonObject(text) as CompilerJson;
    const scene_brief = clipSceneBrief(typeof parsed.scene_brief === "string" ? parsed.scene_brief.trim() : "");
    const title_hint =
      typeof parsed.title_hint === "string"
        ? parsed.title_hint.trim()
        : typeof parsed.titleHint === "string"
          ? parsed.titleHint.trim()
          : "";
    const labels = asStringArray(parsed.allowed_labels ?? parsed.allowedLabels, MAX_LABEL_ITEMS);
    if (!scene_brief) throw new Error("empty scene_brief");
    return {
      compiledQuery: buildCompiledUserQuery(scene_brief, labels, input.retrievalDigest),
      titleHint: (title_hint || input.userQuery).slice(0, 80) || "Untitled",
    };
  } catch {
    return {
      compiledQuery: buildCompiledUserQuery(
        input.userQuery.trim(),
        [],
        input.retrievalDigest,
      ),
      titleHint: input.userQuery.trim().slice(0, 80) || "Untitled",
    };
  }
}

export async function compileRegionScene(input: {
  pageQuery: string;
  /** Short user-typed query for this branch (e.g. "Japan"); keeps refine from drifting to unrelated places. */
  anchorQuery?: string;
  subject: string;
  visionNextQuery: string;
  themeBlock: string;
  retrievalDigest: string;
  /** Single-topic explainer layout (Flipbook-style drill-down vs collage). */
  flipbookDrilldown?: boolean;
}): Promise<{ compiledQuery: string; titleHint: string }> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    const fallback = [input.visionNextQuery.trim(), `Focus: ${input.subject}`.trim()].filter(Boolean).join("\n\n");
    const d = input.retrievalDigest.trim();
    return {
      compiledQuery: d ? `${fallback}\n\nRetrieval notes:\n${d}` : fallback,
      titleHint: input.subject.slice(0, 80) || "Refine",
    };
  }

  const anchor = (input.anchorQuery ?? "").trim();
  const anchorBlock = anchor
    ? `Original user search (stay in this world — combine with sketch subject):\n${anchor.slice(0, 400)}\n\n`
    : "";

  const flipbookBlock = input.flipbookDrilldown
    ? `Layout mode: **Flipbook drill-down page** (one routed topic only).\n` +
      `- **One** primary focal: a large central graphic, diagram, map detail, or symbol for the chosen subject only.\n` +
      `- At most **two** side panels with tightly related facts (origin, dates, meaning)—not a gallery of unrelated national symbols.\n` +
      `- Optional: slim breadcrumb-style line at top; one footer stat line; thin annotation leader lines from small labels to parts of the focal graphic.\n` +
      `- **Forbidden:** encyclopedia collages (random tiger + cricket + food + separate monuments) unless they are strictly required to explain this one subject.\n\n`
    : "";

  const instruction =
    `You are a strict prompt compiler for an image model.\n` +
    anchorBlock +
    flipbookBlock +
    `Previous page user intent:\n${input.pageQuery.slice(0, 2000)}\n\n` +
    `Chosen routed topic (user sketch / selection):\n${input.subject.slice(0, 400)}\n\n` +
    `Vision / route draft next-scene prompt (use as intent, but tighten):\n${input.visionNextQuery.slice(0, 4000)}\n\n` +
    `Global visual theme (must carry forward):\n${input.themeBlock.slice(0, 2000)}\n\n` +
    `Retrieval digest (optional grounding for the sketch subject):\n${input.retrievalDigest.slice(0, 6000)}\n\n` +
    `Return ONLY JSON (no markdown) of the form:\n` +
    `{"scene_brief":"…","title_hint":"<=80 chars","allowed_labels":["<=12 words each","… up to ${MAX_LABEL_ITEMS} items"]}\n` +
    `Rules:\n` +
    `- The next image must be MOSTLY about the chosen subject (~70–95% of visual attention), with only light continuity from the prior page.\n` +
    `- When an original user search is given above, scene_brief must stay in that scope (e.g. bullet trains *in Japan*), not an unrelated destination that only appeared as a small map label.\n` +
    `- No fake OS/browser UI: no modal toasts, scrollbars, or “draft version” dialogs.\n` +
    `- Spell-check all words in scene_brief and allowed_labels.\n` +
    `- scene_brief: **under ~900 characters**, one tight paragraph—image models render cleaner with shorter briefs.\n` +
    `- allowed_labels: at most **${MAX_LABEL_ITEMS}** items (headlines, captions, map labels); balance with photography/maps/icons.\n`;

  try {
    const text = await geminiJsonText(instruction);
    const parsed = extractJsonObject(text) as CompilerJson;
    const scene_brief = clipSceneBrief(typeof parsed.scene_brief === "string" ? parsed.scene_brief.trim() : "");
    const title_hint =
      typeof parsed.title_hint === "string"
        ? parsed.title_hint.trim()
        : typeof parsed.titleHint === "string"
          ? parsed.titleHint.trim()
          : "";
    const labels = asStringArray(parsed.allowed_labels ?? parsed.allowedLabels, MAX_LABEL_ITEMS);
    if (!scene_brief) throw new Error("empty scene_brief");
    return {
      compiledQuery: buildCompiledUserQuery(scene_brief, labels, input.retrievalDigest),
      titleHint: (title_hint || input.subject).slice(0, 80) || "Refine",
    };
  } catch {
    const fallback = [input.visionNextQuery.trim(), `Focus: ${input.subject}`.trim()].filter(Boolean).join("\n\n");
    return {
      compiledQuery: buildCompiledUserQuery(fallback, [], input.retrievalDigest),
      titleHint: input.subject.slice(0, 80) || "Refine",
    };
  }
}
