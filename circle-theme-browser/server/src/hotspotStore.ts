/** Tap target from graph routing (same asset + same id → same `next_query`). */

export type PageHotspot = {
  id: string;
  label: string;
  next_query: string;
  /** Axis-aligned box in **normalized image space** (0–1): origin top-left of bitmap. */
  rect: { x: number; y: number; w: number; h: number };
};

const store = new Map<string, PageHotspot[]>();

function key(sessionId: string, contentId: string): string {
  return `${sessionId}::${contentId}`;
}

export function setPageHotspots(sessionId: string, contentId: string, hotspots: PageHotspot[]): void {
  if (!hotspots.length) return;
  store.set(key(sessionId, contentId), hotspots);
}

export function getPageHotspots(sessionId: string, contentId: string): PageHotspot[] | undefined {
  return store.get(key(sessionId, contentId));
}
