/**
 * Resizes an image file/blob to a maximum dimension while preserving aspect ratio.
 * Returns a base64 data URI (JPEG) suitable for sending to the server.
 *
 * @param source  - File, Blob, or existing base64 data URI string
 * @param maxPx   - Maximum width or height in pixels (default: 1280)
 * @param quality - JPEG quality 0–1 (default: 0.82)
 */
export async function resizeImage(
  source: File | Blob | string,
  maxPx = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;

      // Calculate new dimensions maintaining aspect ratio
      let newW = w;
      let newH = h;
      if (w > maxPx || h > maxPx) {
        if (w >= h) {
          newW = maxPx;
          newH = Math.round((h / w) * maxPx);
        } else {
          newH = maxPx;
          newW = Math.round((w / h) * maxPx);
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, newW, newH);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      URL.revokeObjectURL(img.src);
      resolve(dataUrl);
    };

    img.onerror = () => {
      reject(new Error("Failed to load image for resizing"));
    };

    if (typeof source === "string") {
      // Already a data URI or URL
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
}
