# Generative UI Browser

## Demo

![Generative UI Browser screen recording](generative-ui-browser/docs/demo.gif)

If you haven’t really bumped into **generative UI** yet, the short version is: **your screen is generated on the fly** when you **type** or **tap**—not the same fixed layout with smarter text dropped in.

In **`generative-ui-browser/`** we wired that loop for real: an **opening search** → **full-page image** → **tap where you want to go next** (instead of digging through menus) → **another image** that tries to follow. Behind that: **web snippets**, a **scene compile** step, **image generation**, and **vision** on the tap. **Gemini** or **OpenAI** keys turn on real images; without keys you get **stubs**, and the UI still runs end-to-end.

This isn’t claiming to be the **final** shape of anything—but it’s **fun to use**, and the idea I keep coming back to is **moving through the picture** instead of treating the web like a **directory listing**.

**Tradeoff, said plainly:** link lists still win for **exact answers and provenance**. This shape shines when **“show me”** beats **“tell me in paragraphs.”**

→ **[Install, run, and configure](./generative-ui-browser/README.md)**

## License

Add a `LICENSE` file when you’re ready to declare terms; none ships here by default.
