# Generative UI search browser

A **search-style box** for generative UI: you type a query like a web search, get a **full-frame generated image** as the “results,” then **sketch on the picture** to open the next scene. The runnable app is **`circle-theme-browser/`** (Node + React; optional Gemini or OpenAI for real images).

→ **[How to run it](./circle-theme-browser/README.md)**

Older or experimental code may live alongside that folder; start with **`circle-theme-browser`** if you just want to try the experience.

## Security

- **Never commit API keys.** Use a local `.env` (gitignored). Copy `.env.example` and add your own keys.
- If a key was ever exposed, **rotate it** in [Google AI Studio](https://aistudio.google.com/apikey) or your OpenAI account.

## License

Add a `LICENSE` file if you intend to open-source; none is bundled by default.
