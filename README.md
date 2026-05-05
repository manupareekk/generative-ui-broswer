# Generative UI Browser

**Generative UI** here means something simple to say and hard to ship: **each time you commit to a next step, you get a fresh screen—generated for that moment**—instead of sliding another panel inside the same fixed layout.

This repo is a small working sketch of that idea: **search in → full image out → tap on the picture → another full image**, and so on. It’s closer to **moving through scenes** than to **clicking down a list of links**—same “look something up” habit, different material on the glass.

The runnable app lives in **`generative-ui-browser/`**.

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
