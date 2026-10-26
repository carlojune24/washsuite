/**
 * Downscale + JPEG-compress an image file client-side before it's stored as a
 * base64 data URL in SQLite, so a multi-MB phone camera photo doesn't bloat
 * the local DB. No native file APIs involved -- works the same on desktop
 * (WebView2) and Android (WebView).
 */
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1280,
  quality = 0.72,
  format: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL(format, quality);
}
