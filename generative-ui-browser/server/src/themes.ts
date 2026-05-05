/** Preset style blocks prepended to every image prompt (and region resolution). */
export const THEME_PRESETS: Record<string, string> = {
  clean:
    "Style: Premium **interactive map / data-viz dashboard** infographic — bright, crisp, trustworthy: airy whites and soft neutrals, gentle card shadows, **one clear focal** (often a simplified country or region map) with **circular photo callouts** and compact floating panels (stats, affiliations) like a polished product explainer—not a museum collage of many equal-sized paintings. Thin consistent line icons; restrained palette; lots of breathing room at the edges. Mix small photography, map, icons, and short on-image copy only where it clarifies. Full-frame 16:9 landscape; cohesive lighting across frames.",
  retro_mac:
    "Visual theme: early-90s beige Macintosh aesthetic — chunky pixels, Chicago/Geneva vibe, 1-bit dither hints, warm CRT cast. Full-frame 16:9 landscape illustration.",
  watercolor:
    "Visual theme: watercolor storybook illustration — soft edges, paper grain, limited palette, gentle lighting. Full-frame 16:9 landscape composition.",
  noir_cinematic:
    "Visual theme: noir cinematic still — high contrast, moody lighting, film grain, desaturated with one accent color. Full-frame 16:9 landscape.",
};

export const DEFAULT_THEME_KEY = "clean";

export function resolveThemeBlock(presetKey: string, customAppend: string): string {
  const base = THEME_PRESETS[presetKey] ?? THEME_PRESETS[DEFAULT_THEME_KEY];
  const extra = customAppend.trim();
  if (!extra) return base;
  return `${base}\n\nAdditional direction: ${extra}`;
}
