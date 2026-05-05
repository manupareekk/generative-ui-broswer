# Generative UI Browser

**Generative UI** (here): **each next step gets a new generated screen**, not another panel in the same chrome.

This repo sketches that as **search → full image → tap the image → next full image**—more **scene-to-scene** than **link list to link list**. Same lookup habit, different surface.

Code: **`generative-ui-browser/`**.

## Demo

![Generative UI Browser screen recording](generative-ui-browser/docs/demo.gif)

Preview (~18s, silent GIF). **Full demo with audio:** [demo.mp4](./generative-ui-browser/docs/demo.mp4) — open or download from the repo.

## Where this fits

A lot of “generative UI” today still **wears normal app chrome**: sidebars, tabs, cards—AI fills *regions* of the UI. That’s useful; the **frame** is still the old frame.

What’s interesting to explore next is the opposite emphasis: the **whole viewport is the output**—less “widget with smart text,” more **one coherent image per beat**. Your “controls” aren’t labeled buttons; they’re **places in the picture** you choose to follow. Each choice is a fork: **new intent → new screen**, not another hop through the same template.

That’s expensive, fuzzy, and wrong sometimes—**links and lists stay unbeatable** when you need provenance, exact text, and speed. Image-native navigation is a bet on a different job: **exploration, orientation, and “show me”**—where the next thing you want is *another view*, not another paragraph.

The implementation here is a **Node + React** app in **`generative-ui-browser/`** (Gemini / OpenAI when keys are set; placeholders otherwise).

→ **[Install, run, and configure](./generative-ui-browser/README.md)**

## License

Add a `LICENSE` file when you’re ready to declare terms; none ships here by default.
