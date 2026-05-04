# Circle theme browser

Standalone app (not wired into the other folders in this repo): a **Google-style** single search box; your query is the full image brief. A default theme is applied on the server. **Drag a circle** on the image (diameter drag) to refine the next frame.

## Run

```bash
cd circle-theme-browser
npm install
cp .env.example .env   # add GEMINI_API_KEY and/or OPENAI_API_KEY for real images
npm run dev
```

- API: `http://127.0.0.1:3020` (override with `CIRCLE_BROWSER_PORT`)
- UI: Vite prints a URL (default **http://localhost:5182**), proxying `/api` to the API

## Flow

1. Type everything you want in the **search** field (style, scene, layout, constraints) and submit.
2. The image appears below. Optionally **drag a diameter** on the image to circle a region for the next generation (same default server theme).

## Production build

```bash
npm run build
node server/dist/index.js
```

Serve `client/dist` as static files and set `VITE_API_ORIGIN` when building the client if the API lives on another host.

## Audits

```bash
npm run check
```

Runs a full TypeScript + Vite production build and `npm audit` (fails on high or critical advisories).
