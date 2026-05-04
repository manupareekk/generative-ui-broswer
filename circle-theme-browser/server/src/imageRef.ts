import sharp from "sharp";

export async function loadImageBufferFromUrl(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const m = imageUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (!m) throw new Error("Unsupported data URL");
    const isBase64 = Boolean(m[2]);
    const payload = m[3] ?? "";
    if (isBase64) return Buffer.from(payload.replace(/\s+/g, ""), "base64");
    return Buffer.from(decodeURIComponent(payload), "utf8");
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Unsupported image URL");
}

export type ReferenceImage = { mimeType: string; dataBase64: string };

/** Downscale so Gemini multimodal requests stay reasonable. */
export async function toPngReference(buf: Buffer, maxEdge = 1536): Promise<ReferenceImage> {
  const img = sharp(buf).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const pipeline =
    w > maxEdge || h > maxEdge
      ? img.resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      : img;
  const out = await pipeline.png({ compressionLevel: 7 }).toBuffer();
  return { mimeType: "image/png", dataBase64: out.toString("base64") };
}

/** Square crop around (cx,cy) with radius r in **bitmap pixel** coordinates. */
export async function cropSquareAround(buf: Buffer, cx: number, cy: number, r: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const iw = meta.width ?? 0;
  const ih = meta.height ?? 0;
  if (!iw || !ih) throw new Error("Could not read image dimensions");

  const side = Math.ceil(2 * r);
  let left = Math.floor(cx - r);
  let top = Math.floor(cy - r);
  left = Math.max(0, Math.min(left, iw - 1));
  top = Math.max(0, Math.min(top, ih - 1));
  const width = Math.min(side, iw - left);
  const height = Math.min(side, ih - top);
  if (width < 8 || height < 8) throw new Error("Crop too small");

  return sharp(buf).extract({ left, top, width, height }).png({ compressionLevel: 7 }).toBuffer();
}
