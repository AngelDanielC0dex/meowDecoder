/**
 * Downscale + recompress an uploaded image to a small WebP blob, entirely in the
 * browser (no upload, no dependency). Cat photos are shown small (a list avatar
 * or a presentation card), so storing the original multi-MB file would waste
 * IndexedDB and memory; this caps the longest side and re-encodes to WebP,
 * honoring EXIF orientation so phone portraits aren't sideways.
 */

export interface OptimizeOptions {
  /** Longest-side cap in px (the image is only ever scaled DOWN). */
  readonly maxSize: number;
  /** WebP quality, 0–1. */
  readonly quality: number;
}

/** Tuned presets for the two places a cat photo appears. */
export const IMAGE_PRESETS = {
  avatar: { maxSize: 512, quality: 0.85 },
  card: { maxSize: 1080, quality: 0.85 },
} as const satisfies Record<string, OptimizeOptions>;

/** Largest accepted input file (before optimization). */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

/** Reason codes so callers can map to a localized message. */
export type ImageOptimizeReason = "too-large" | "decode-failed" | "encode-failed";

export class ImageOptimizeError extends Error {
  constructor(public readonly reason: ImageOptimizeReason) {
    super(reason);
    this.name = "ImageOptimizeError";
  }
}

export async function optimizeImage(file: File, opts: OptimizeOptions): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageOptimizeError("too-large");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // e.g. HEIC or a file the browser can't decode.
    throw new ImageOptimizeError("decode-failed");
  }

  try {
    const scale = Math.min(1, opts.maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageOptimizeError("encode-failed");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", opts.quality),
    );
    if (!blob) throw new ImageOptimizeError("encode-failed");
    return blob;
  } finally {
    bitmap.close();
  }
}
