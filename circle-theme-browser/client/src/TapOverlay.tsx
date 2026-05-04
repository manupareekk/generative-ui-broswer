import { useCallback, useEffect, useRef, useState } from "react";
import { overlayPointToNatural } from "./naturalFromOverlay.js";
import type { PageHotspot } from "./types.js";

type Region = { cx_px: number; cy_px: number; r_px: number; img_w: number; img_h: number };

type Props = {
  imgRef: React.RefObject<HTMLImageElement | null>;
  disabled: boolean;
  /** Normalized-rect tap targets from server (graph routing). */
  hotspots?: PageHotspot[];
  contentId?: string | null;
  /** Deterministic route: same `hotspot_id` on this `content_id` → same cached brief server-side. */
  onGraphTap?: (hotspotId: string, contentId: string) => void;
  /** Fallback: free tap uses vision from pixel focus. */
  onTap: (region: Region) => void;
  /** Tap landed in letterboxing outside the bitmap. */
  onTapOutsideImage?: () => void;
};

function hitSmallestHotspot(nx: number, ny: number, hotspots: PageHotspot[]): PageHotspot | null {
  let best: PageHotspot | null = null;
  let bestArea = Infinity;
  for (const h of hotspots) {
    const { x, y, w, h: hh } = h.rect;
    if (nx < x || nx > x + w || ny < y || ny > y + hh) continue;
    const area = w * hh;
    if (area < bestArea) {
      bestArea = area;
      best = h;
    }
  }
  return best;
}

/**
 * Hit layer over the displayed image: prefers **graph** hotspots when present,
 * else a single free tap (vision).
 */
export function TapOverlay({
  imgRef,
  disabled,
  hotspots,
  contentId,
  onGraphTap,
  onTap,
  onTapOutsideImage,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const rippleClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashRipple = useCallback((x: number, y: number) => {
    if (rippleClearRef.current) clearTimeout(rippleClearRef.current);
    const key = Date.now();
    setRipple({ x, y, key });
    rippleClearRef.current = setTimeout(() => {
      setRipple(null);
      rippleClearRef.current = null;
    }, 480);
  }, []);

  useEffect(() => {
    return () => {
      if (rippleClearRef.current) clearTimeout(rippleClearRef.current);
    };
  }, []);

  const syncSize = useCallback(() => {
    const img = imgRef.current;
    const layer = layerRef.current;
    if (!img || !layer) return;
    layer.style.width = `${img.clientWidth}px`;
    layer.style.height = `${img.clientHeight}px`;
  }, [imgRef]);

  useEffect(() => {
    syncSize();
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => syncSize());
    ro.observe(img);
    return () => ro.disconnect();
  }, [imgRef, syncSize]);

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const img = imgRef.current;
    const layer = layerRef.current;
    if (!img?.complete || !img.naturalWidth || !layer) return;

    const rect = layer.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    const ow = layer.clientWidth;
    const oh = layer.clientHeight;

    flashRipple(ox, oy);

    const n = overlayPointToNatural(img, ow, oh, ox, oy);
    if (!n) {
      onTapOutsideImage?.();
      return;
    }

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const nx = n.x / nw;
    const ny = n.y / nh;

    const hs = hotspots?.length && contentId && onGraphTap ? hotspots : undefined;
    if (hs?.length) {
      const hit = hitSmallestHotspot(nx, ny, hs);
      if (hit) {
        onGraphTap(hit.id, contentId);
        return;
      }
    }

    const rPx = Math.max(36, Math.round(0.056 * Math.min(nw, nh)));
    onTap({
      cx_px: n.x,
      cy_px: n.y,
      r_px: rPx,
      img_w: nw,
      img_h: nh,
    });
  };

  return (
    <div
      ref={layerRef}
      className="tap-overlay"
      style={{
        pointerEvents: disabled ? "none" : "auto",
        cursor: disabled ? "default" : "pointer",
      }}
      aria-label={hotspots?.length ? "Tap a topic on the image" : "Tap the image to open a focused topic"}
      onPointerUp={onPointerUp}
    >
      {ripple ? (
        <span
          key={ripple.key}
          className="tap-ripple"
          style={{ left: ripple.x, top: ripple.y }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
