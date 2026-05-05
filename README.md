# Generative UI Browser

## What this is

A runnable experiment in **generative UI**: type a **search**, get a **full-page image**, **tap where you want to go next**, get **another full image**—**moving through the picture** instead of digging through menus or link lists. Implemented in **`generative-ui-browser/`** (Node + React). **Gemini** or **OpenAI** keys enable real images; without them you still get **stubs** so the flow is visible end-to-end.

## Demo

![Generative UI Browser screen recording](generative-ui-browser/docs/demo.gif)

## The idea

If you haven’t bumped into **generative UI** in this sense yet: **the screen is generated on the fly** when you **type** or **tap**—not the same fixed chrome with slightly smarter text.

This isn’t claiming to be the **final** shape of anything, but it’s **fun to use**. The line I keep coming back to is **moving through the picture** instead of treating the web like a **directory listing**.

## Under the hood

**Opening search** → **full-page image** → **tap to branch** → **next image**. Behind that: **web snippets**, a **scene compile** step, **image generation**, and **vision** on the tap—all wired together, not a slide mock.

## When this shape helps

**Tradeoff, said plainly:** link lists still win for **exact answers and provenance**. This shape shines when **“show me”** beats **“tell me in paragraphs.”**

## Run it

→ **[Install, run, and configure](./generative-ui-browser/README.md)**

## License

Add a `LICENSE` file when you’re ready to declare terms; none ships here by default.
