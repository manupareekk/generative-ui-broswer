export type WebSnippet = { title: string; body: string; source: string };

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

async function braveSearch(q: string, limit: number): Promise<WebSnippet[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return [];

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${limit}`;
  const res = await fetch(url, { headers: { "X-Subscription-Token": key, Accept: "application/json" } });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
  };
  const rows = json.web?.results ?? [];
  const out: WebSnippet[] = [];
  for (const r of rows.slice(0, limit)) {
    const title = typeof r.title === "string" ? r.title : "";
    const body = typeof r.description === "string" ? r.description : "";
    const href = typeof r.url === "string" ? r.url : "";
    if (!title && !body) continue;
    out.push({
      title: clip(title, 120),
      body: clip(body, 320),
      source: clip(href, 200),
    });
  }
  return out;
}

async function duckDuckGoInstant(q: string, limit: number): Promise<WebSnippet[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    Abstract?: string;
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>;
  };

  const out: WebSnippet[] = [];
  const abs = (json.AbstractText || json.Abstract || "").trim();
  const head = (json.Heading || "").trim();
  const absUrl = (json.AbstractURL || "").trim();
  if (abs) {
    out.push({
      title: clip(head || "Summary", 120),
      body: clip(abs, 600),
      source: clip(absUrl, 200),
    });
  }

  const topics = Array.isArray(json.RelatedTopics) ? json.RelatedTopics : [];
  for (const t of topics) {
    if (out.length >= limit) break;
    const text = typeof t.Text === "string" ? t.Text : "";
    const href = typeof t.FirstURL === "string" ? t.FirstURL : "";
    if (!text) continue;
    const title = text.includes(" - ") ? text.split(" - ")[0] : text.slice(0, 80);
    const body = text.includes(" - ") ? text.split(" - ").slice(1).join(" - ") : text;
    out.push({ title: clip(title, 120), body: clip(body, 360), source: clip(href, 200) });
  }

  return out.slice(0, limit);
}

/** Lightweight retrieval: Brave (if `BRAVE_SEARCH_API_KEY`) else DuckDuckGo instant answer + related topics. */
export async function retrieveSnippets(userQuery: string, clickSubject?: string): Promise<WebSnippet[]> {
  const q = [userQuery.trim(), clickSubject?.trim()].filter(Boolean).join(" — ").slice(0, 400);
  if (!q) return [];

  const n = Math.max(3, Math.min(10, Number(process.env.RETRIEVAL_TOP_N || 8)));

  const brave = await braveSearch(q, n);
  if (brave.length) return brave;

  return duckDuckGoInstant(q, n);
}

export function snippetsToDigest(snippets: WebSnippet[], maxChars = 3500): string {
  if (!snippets.length) return "";
  const lines = snippets.map((s, i) => {
    const src = s.source ? ` (${s.source})` : "";
    return `${i + 1}. ${s.title}: ${s.body}${src}`;
  });
  const text = lines.join("\n");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…`;
}
