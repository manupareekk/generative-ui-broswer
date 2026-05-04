# Generative UI Browser

**Generative UI Browser** — a search-style flow where each “page” is a full image you tap or sketch to explore. This repository hosts that project; the app you run lives in the **`circle-theme-browser/`** folder (historical path name).

<video src="https://cdn.jsdelivr.net/gh/manupareekk/generative-ui-browser@main/circle-theme-browser/docs/demo.mp4" controls playsinline muted preload="metadata" width="100%"></video>

**[Open demo video](./circle-theme-browser/docs/demo.mp4)** — same file in the repo (GitHub’s `raw.githubusercontent.com` URL serves MP4 as `application/octet-stream`, so many browsers refuse to play it inside `<video>`; this embed uses jsDelivr, which sends `video/mp4`).

## Where this fits

**Generative UI** usually still looks like a normal app: sidebars, buttons, and boxes—except some of the *content* inside those boxes is AI-generated. That’s a big step, but the **frame** of the experience is still traditional UI.

This project is a small take on what often comes **next**: the **whole screen can be the generated surface**. You’re not filling a widget with text; you’re **looking at a scene** the model drew for you. Your “buttons” are **places in the picture**—you point or sketch where your attention goes, and the next screen is another full image. It feels closer to **browsing** than to **chatting**, but the browser chrome is gone: just a **search-style question** and then **pixels**.

In short: **search in, picture out, sketch to go deeper.** Same habit as looking something up, different material than links and paragraphs.

The **Generative UI Browser** implementation is a small Node + React app in **`circle-theme-browser/`** (plug in Gemini or OpenAI for real images, or run without keys to see placeholders).

→ **[Install, run, and configure](./circle-theme-browser/README.md)**

This repo may contain other experiments next to that folder; to try **Generative UI Browser**, open **`circle-theme-browser`** first.

## Security

- **Never commit API keys.** Keep them in a local `.env` file (ignored by git). Start from `.env.example` and add your own values.
- If a key was ever shared or checked in by mistake, **rotate it** in [Google AI Studio](https://aistudio.google.com/apikey) or your OpenAI account.

## License

Add a `LICENSE` file when you’re ready to declare terms; none ships here by default.
