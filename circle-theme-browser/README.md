# Circle theme browser

**Generative UI search browser** — one **search-style** field for your prompt, then the “page” is a **single full-frame image**. Refine by **sketching** on the picture (vision interprets the region, then a new image loads), same way you’d keep searching, but the UI stays pixels-first.

Stack: **Express** API + **Vite/React** client, **Server-Sent Events** for streaming status, optional **Gemini** (image + vision) or **OpenAI Images**, otherwise **SVG stubs** when no key is set.

## Quick start

```bash
cd circle-theme-browser
npm install
cp .env.example .env
# Edit .env: set GEMINI_API_KEY (recommended) and/or OPENAI_API_KEY — never commit .env
npm run dev
```

- **API:** `http://127.0.0.1:3020` (override with `CIRCLE_BROWSER_PORT`)
- **UI:** Vite dev server (default **http://localhost:5182**), proxies `/api` to the API

## Flow

1. Describe the scene (style, subject, layout, constraints) and submit — same mental model as a search box, but the result is **one generated image**.
2. **Sketch** on the image with pointer or stylus; the server interprets the region and returns a **new** full-frame image continuing that thread.

## Production

```bash
npm run build
node server/dist/index.js
```

Serve `client/dist` as static files. If the API is on another origin, set **`VITE_API_ORIGIN`** when building the client.

## Quality / audits

```bash
npm run check
```

Runs TypeScript + production Vite build and `npm audit` (fails on high or critical advisories).

## Configuration

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Primary image + vision (Google AI Studio key) |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` | Alternates read by the same loader |
| `OPENAI_API_KEY` | Used only if no Gemini key |
| `GEMINI_IMAGE_MODEL` | Default `gemini-2.5-flash-image` |
| `GEMINI_VISION_MODEL` | Default `gemini-2.0-flash` |
| `CIRCLE_BROWSER_PORT` | API port (default `3020`) |

Optional request body fields (for custom deployments): `theme_preset`, `theme_custom` — see `server/src/themes.ts`.

## Security

- **Do not commit `.env`** or real keys. Only `.env.example` belongs in git (empty values).
- Keys are read at runtime from the environment; nothing in this package embeds a secret.
