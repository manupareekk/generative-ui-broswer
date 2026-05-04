/** Preset style blocks prepended to every image prompt (and region resolution). */
export const THEME_PRESETS: Record<string, string> = {
  clean:
    "Style: Modern search-and-discovery look — bright, crisp, trustworthy: airy whites and soft neutrals, gentle depth and shadows, clear visual hierarchy like a top-tier answer surface (not a literal SERP screenshot, not fake URL bars or browser chrome). Contemporary, informational, and scannable; several distinct regions worth sketching next (answer cards, maps, callouts, diagrams, in-image labels as painted pixels). Avoid medieval, parchment, or storybook fantasy unless the query explicitly asks. Full-frame 16:9 landscape; cohesive lighting across frames.",
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
