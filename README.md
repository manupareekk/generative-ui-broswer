# Generative UI browser

Monorepo for experiments in **generative, image-first browsing**: type a prompt, get a full-frame image, then **sketch regions** to refine the next scene—no traditional page chrome.

## Main app: `circle-theme-browser/`

Standalone Node + React app: search-style box, server-side prompt assembly (theme + holistic rules + your query), **Gemini** or **OpenAI** image generation, **SSE** progress, and **pencil-sketch** refinement over the image.

→ **[Run instructions and architecture](./circle-theme-browser/README.md)**

Other folders in this repo may be prototypes or older experiments; treat **`circle-theme-browser`** as the primary documented surface.

## Security

- **Never commit API keys.** Use `.env` locally (gitignored). Copy only `.env.example` and fill in blanks.
- If a key was ever pasted into chat or committed, **rotate it** in [Google AI Studio](https://aistudio.google.com/apikey) or your OpenAI dashboard.
- This repository should only contain **empty** `GEMINI_API_KEY=` / `OPENAI_API_KEY=` placeholders in `.env.example` files.

## GitHub “About” description (copy-paste)

Use this as the repository **Description** on GitHub → *Settings* or the gear next to “About”:

> Image-first generative browser: search a scene, sketch to refine. Node + React + Gemini/OpenAI. Keys via `.env` only.

**Topics / tags (suggested):** `generative-ui`, `gemini`, `image-generation`, `react`, `typescript`, `sse`, `vite`

## License

Add a `LICENSE` file if you intend to open-source; none is bundled by default.
