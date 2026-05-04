# generative-ui-browser

## What you’re running

This folder (`circle-theme-browser` in the monorepo) is the **generative-ui-browser** app: a **single search bar** and a **full-frame image** underneath. You describe what you want to see (like you’d type a search), press go, and the “answer” isn’t a list of links—it’s **one picture** meant to carry the idea.

**What’s new compared to typical generative UI?**  
Instead of AI living *inside* classic layout components, the **page itself is the output**. To move forward, you **sketch on the image**—roughly circling or looping the part you care about—and the app asks the model to **continue from that place**. You’re navigating **through** the image, not through menus.

So the loop is simple:

1. **Ask** — Type a prompt (tone, topic, style, level of detail—whatever you’d put in a search).
2. **See** — Get a new full-screen image built for that prompt.
3. **Point** — Draw on the part you want to explore next; get another image that follows that thread.

Under the hood it’s an **Express** API plus a **Vite + React** client, with **live updates over SSE** while images are prepared. With API keys set, it uses **Gemini** for images (and vision for your sketch); without keys you still get a **stub preview** so the UI is testable.

---

## Quick start

```bash
cd circle-theme-browser
npm install
cp .env.example .env
# Edit .env: add GEMINI_API_KEY (recommended) and/or OPENAI_API_KEY — never commit .env
npm run dev
```

- **API:** `http://127.0.0.1:3020` (change with `CIRCLE_BROWSER_PORT` if you like)
- **App in the browser:** Vite prints a URL (often **http://localhost:5182**); it proxies `/api` to the server above

---

## Day-to-day flow

1. Treat the box like **search**: one prompt per “page” you want to see.
2. When the image appears, **sketch** on it wherever you’d “click through” if this were a website—except the click target is **whatever you draw around**.

---

## Production build

```bash
npm run build
node server/dist/index.js
```

Ship the contents of `client/dist` as static files. If your API lives on another domain, set **`VITE_API_ORIGIN`** when you build the client so it knows where to call.

---

## Checks

```bash
npm run check
```

Builds everything and runs `npm audit` (fails on high or critical issues).

---

## Server pipeline (what happens on each request)

1. **Retrieve** — Fetches a few web snippets for grounding (Brave if `BRAVE_SEARCH_API_KEY` is set, otherwise DuckDuckGo instant answer + related topics).
2. **Compile** — Gemini text (`GEMINI_COMPILER_MODEL`, default `gemini-2.0-flash`) turns your query (and retrieval digest) into a **strict scene brief**, optional **spell-checked labels** (max 8 words each), and minimal-text rules.
3. **Vision (sketch only)** — Interprets the sketched region → draft `next_query`.
4. **Render** — Gemini image model gets the compiled brief + **reference images** on sketch refine: the **full previous frame** plus a **square crop** around your sketch (for continuity + click relevance). Initial search has no references.

---

## Environment variables

| Variable | What it’s for |
|----------|----------------|
| `GEMINI_API_KEY` | Main path: image generation + sketch understanding (Google AI Studio) |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` | Other env names the server also accepts |
| `OPENAI_API_KEY` | Optional fallback images if Gemini isn’t configured |
| `GEMINI_IMAGE_MODEL` | Default `gemini-2.5-flash-image` |
| `GEMINI_VISION_MODEL` | Default `gemini-2.0-flash` |
| `GEMINI_COMPILER_MODEL` | Default `gemini-2.0-flash` (scene “compiler” JSON step) |
| `BRAVE_SEARCH_API_KEY` | Optional: richer retrieval than DuckDuckGo alone |
| `RETRIEVAL_TOP_N` | Max snippets to fold into the digest (default `8`) |
| `CIRCLE_BROWSER_PORT` | API port (default `3020`) |

Advanced: you can send `theme_preset` and `theme_custom` in API bodies—see `server/src/themes.ts`.

---

## Security

- Only **`.env.example`** belongs in git (empty placeholders). Your real **`.env`** stays on your machine.
- Keys are never baked into the source; they’re read when the server runs.
