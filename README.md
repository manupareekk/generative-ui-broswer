# Generative UI search browser

## Where this fits

**Generative UI** usually still looks like a normal app: sidebars, buttons, and boxes—except some of the *content* inside those boxes is AI-generated. That’s a big step, but the **frame** of the experience is still traditional UI.

This project is a small take on what often comes **next**: the **whole screen can be the generated surface**. You’re not filling a widget with text; you’re **looking at a scene** the model drew for you. Your “buttons” are **places in the picture**—you point or sketch where your attention goes, and the next screen is another full image. It feels closer to **browsing** than to **chatting**, but the browser chrome is gone: just a **search-style question** and then **pixels**.

In short: **search in, picture out, sketch to go deeper.** Same habit as looking something up, different material than links and paragraphs.

The code you can run today lives in **`circle-theme-browser/`** (a small Node + React app; plug in Gemini or OpenAI for real images, or run without keys to see placeholders).

→ **[Install, run, and configure](./circle-theme-browser/README.md)**

This repo may contain other experiments next to that folder; if you only want to try the idea above, open **`circle-theme-browser`** first.

## Security

- **Never commit API keys.** Keep them in a local `.env` file (ignored by git). Start from `.env.example` and add your own values.
- If a key was ever shared or checked in by mistake, **rotate it** in [Google AI Studio](https://aistudio.google.com/apikey) or your OpenAI account.

## License

Add a `LICENSE` file when you’re ready to declare terms; none ships here by default.
