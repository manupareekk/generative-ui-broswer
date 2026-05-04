import { useCallback, useEffect, useRef } from "react";
import { overlayPointToNaturalClamped } from "./naturalFromOverlay.js";

type Props = {
  imgRef: React.RefObject<HTMLImageElement | null>;
  disabled: boolean;
  /** Sketch is converted to a circle enclosing the stroke bbox (same API as before). */
  onCommit: (region: { cx_px: number; cy_px: number; r_px: number; img_w: number; img_h: number }) => void;
  /** Fired when the user finishes a stroke that is too small or sparse to use (optional UX hint). */
  onStrokeRejected?: (reason: "too_short" | "too_small") => void;
};

const MIN_POINTS = 12;
const MIN_OVERLAY_SPAN = 40;
const MIN_NATURAL_R = 10;
const SAMPLE_GAP_PX = 3;

/** Pencil tip ~ (2,20); falls back to crosshair if unsupported. */
const PENCIL_CURSOR =
  'url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2724%27%20height%3D%2724%27%20viewBox%3D%270%200%2024%2024%27%3E%3Cpath%20d%3D%27M4%2020l3.5-1%2010-10-3-3-10%2010L4%2020z%27%20fill%3D%27none%27%20stroke%3D%27%23222%27%20stroke-width%3D%271.4%27%20stroke-linejoin%3D%27round%27/%3E%3Cpath%20d%3D%27M15%205l3%203%27%20stroke%3D%27%23222%27%20stroke-width%3D%271.4%27%20stroke-linecap%3D%27round%27/%3E%3C/svg%3E") 2 20, crosshair';

function bbox2d(points: { x: number; y: number }[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function SketchOverlay({ imgRef, disabled, onCommit, onStrokeRejected }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeOverlayRef = useRef<{ ox: number; oy: number }[]>([]);
  const drawingRef = useRef(false);

  const syncCanvasSize = useCallback(() => {
    const img = imgRef.current;
    const c = canvasRef.current;
    if (!img || !c) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [imgRef]);

  useEffect(() => {
    syncCanvasSize();
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(img);
    return () => ro.disconnect();
  }, [imgRef, syncCanvasSize]);

  const redrawStroke = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const pts = strokeOverlayRef.current;
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].ox, pts[0].oy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].ox, pts[i].oy);
    ctx.strokeStyle = "rgba(35, 35, 35, 0.88)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, []);

  const clearDraw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    strokeOverlayRef.current = [];
  }, []);

  const canvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const appendPoint = (ox: number, oy: number) => {
    const pts = strokeOverlayRef.current;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(ox - last.ox, oy - last.oy) < SAMPLE_GAP_PX) return;
    pts.push({ ox, oy });
    redrawStroke();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const img = imgRef.current;
    if (!img.complete || !img.naturalWidth) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokeOverlayRef.current = [];
    const { x, y } = canvasCoords(e);
    strokeOverlayRef.current.push({ ox: x, oy: y });
    redrawStroke();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const { x, y } = canvasCoords(e);
    appendPoint(x, y);
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    drawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const img = imgRef.current;
    const c = canvasRef.current;
    const overlayPts = strokeOverlayRef.current;
    clearDraw();

    if (!img || !c || overlayPts.length < MIN_POINTS) {
      if (overlayPts.length >= 3) onStrokeRejected?.("too_short");
      return;
    }

    const overlayW = c.clientWidth;
    const overlayH = c.clientHeight;
    const bboxO = bbox2d(overlayPts);
    if (!bboxO) return;
    const ow = bboxO.maxX - bboxO.minX;
    const oh = bboxO.maxY - bboxO.minY;
    if (Math.max(ow, oh) < MIN_OVERLAY_SPAN) {
      onStrokeRejected?.("too_small");
      return;
    }

    const naturalPts: { x: number; y: number }[] = [];
    for (const p of overlayPts) {
      const n = overlayPointToNaturalClamped(img, overlayW, overlayH, p.ox, p.oy);
      if (n) naturalPts.push(n);
    }
    if (naturalPts.length < MIN_POINTS) {
      onStrokeRejected?.("too_short");
      return;
    }

    const bboxN = bbox2d(naturalPts);
    if (!bboxN) return;
    const nw = bboxN.maxX - bboxN.minX;
    const nh = bboxN.maxY - bboxN.minY;
    if (nw < 4 || nh < 4) {
      onStrokeRejected?.("too_small");
      return;
    }

    const cx = (bboxN.minX + bboxN.maxX) / 2;
    const cy = (bboxN.minY + bboxN.maxY) / 2;
    const r = Math.hypot(nw / 2, nh / 2);
    if (r < MIN_NATURAL_R) {
      onStrokeRejected?.("too_small");
      return;
    }

    onCommit({
      cx_px: cx,
      cy_px: cy,
      r_px: r,
      img_w: img.naturalWidth,
      img_h: img.naturalHeight,
    });
  };

  const onPointerCancel = () => {
    drawingRef.current = false;
    strokeOverlayRef.current = [];
    clearDraw();
  };

  const onPointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0 && drawingRef.current) {
      drawingRef.current = false;
      strokeOverlayRef.current = [];
      clearDraw();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="sketch-overlay"
      style={{
        pointerEvents: disabled ? "none" : "auto",
        cursor: disabled ? "default" : PENCIL_CURSOR,
      }}
      aria-label="Sketch the area to refine with pencil"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
    />
  );
}
