/**
 * Map a point in overlay pixel space (same box as the displayed <img>) to natural image pixels.
 * Assumes object-fit: contain letterboxing inside overlayW × overlayH.
 */
export function overlayPointToNatural(
  img: HTMLImageElement,
  overlayW: number,
  overlayH: number,
  ox: number,
  oy: number,
): { x: number; y: number } | null {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || overlayW <= 0 || overlayH <= 0) return null;

  const scale = Math.min(overlayW / nw, overlayH / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const padX = (overlayW - dw) / 2;
  const padY = (overlayH - dh) / 2;

  if (ox < padX || ox > padX + dw || oy < padY || oy > padY + dh) return null;
  return { x: (ox - padX) / scale, y: (oy - padY) / scale };
}

/** Same as {@link overlayPointToNatural}, but clamps into the letterboxed image rect so sketch strokes stay valid. */
export function overlayPointToNaturalClamped(
  img: HTMLImageElement,
  overlayW: number,
  overlayH: number,
  ox: number,
  oy: number,
): { x: number; y: number } | null {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || overlayW <= 0 || overlayH <= 0) return null;

  const scale = Math.min(overlayW / nw, overlayH / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const padX = (overlayW - dw) / 2;
  const padY = (overlayH - dh) / 2;
  const cx = Math.min(Math.max(ox, padX), padX + dw);
  const cy = Math.min(Math.max(oy, padY), padY + dh);
  return { x: (cx - padX) / scale, y: (cy - padY) / scale };
}

export function overlayRadiusToNatural(img: HTMLImageElement, overlayW: number, overlayH: number, rOverlay: number): number {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh || overlayW <= 0 || overlayH <= 0) return rOverlay;
  const scale = Math.min(overlayW / nw, overlayH / nh);
  return rOverlay / scale;
}
