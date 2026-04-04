/**
 * annotateAndShare
 *
 * Parallel share flow — completely independent of the IndexedDB / server save path.
 *
 * 1. Draws the raw JPEG onto a Canvas and overlays a text strip (dog ID, date, area, lat/lng).
 * 2. Injects EXIF tags (ImageDescription = dogId, GPS lat/lng) using piexifjs.
 * 3. Calls navigator.share({ files }) so the user can save to Photos / WhatsApp / etc.
 * 4. Falls back to a plain <a download> link on browsers that don't support Web Share.
 *
 * Errors are swallowed silently — this flow must never interfere with the main save.
 */

// piexifjs is a CommonJS module; use dynamic require via Vite's interop
// eslint-disable-next-line @typescript-eslint/no-require-imports
const piexif = require("piexifjs") as typeof import("piexifjs");

export interface SharePayload {
  imageBase64: string;   // data:image/jpeg;base64,... or raw base64
  dogId: string;
  latitude?: number | null;
  longitude?: number | null;
  areaName?: string;
  recordedAt?: number;   // UTC ms
}

/** Convert decimal degrees to EXIF rational array [[deg,1],[min,1],[sec*100,100]] */
function toExifGps(decimal: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = Math.floor(minFull);
  const sec = Math.round((minFull - min) * 6000); // sec * 100
  return [[deg, 1], [min, 1], [sec, 100]];
}

/** Draw text overlay onto canvas and return annotated JPEG blob */
async function canvasAnnotate(
  base64: string,
  dogId: string,
  areaName: string | undefined,
  latitude: number | undefined | null,
  longitude: number | undefined | null,
  recordedAt: number | undefined
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }

      ctx.drawImage(img, 0, 0);

      const W = canvas.width;
      const H = canvas.height;

      // Build overlay lines
      const lines: { text: string; bold: boolean }[] = [];
      lines.push({ text: dogId, bold: true });

      if (recordedAt) {
        const d = new Date(recordedAt);
        const dateStr = d.toLocaleDateString("en-GB", {
          timeZone: "Asia/Kolkata",
          day: "2-digit", month: "short", year: "numeric",
        });
        const timeStr = d.toLocaleTimeString("en-US", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit", minute: "2-digit", hour12: true,
        });
        lines.push({ text: `${dateStr}, ${timeStr}`, bold: false });
      }

      if (areaName) lines.push({ text: areaName, bold: false });
      if (latitude != null && longitude != null) {
        lines.push({ text: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, bold: false });
      }

      const idFontSize = Math.max(18, Math.round(W * 0.038));
      const lineFontSize = Math.max(14, Math.round(W * 0.030));
      const lineHeight = Math.round(lineFontSize * 1.6);
      const padding = Math.max(10, Math.round(W * 0.025));
      const overlayH = padding * 2 + idFontSize + (lines.length - 1) * lineHeight + Math.round(lineHeight * 0.3);

      // Semi-transparent black strip at bottom
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, H - overlayH, W, overlayH);

      // Text
      ctx.fillStyle = "#ffffff";
      let y = H - overlayH + padding + idFontSize;
      for (let i = 0; i < lines.length; i++) {
        const size = i === 0 ? idFontSize : lineFontSize;
        ctx.font = `${lines[i].bold ? "bold " : ""}${size}px Arial, sans-serif`;
        ctx.fillText(lines[i].text, padding, y);
        y += i === 0 ? idFontSize + Math.round(lineHeight * 0.4) : lineHeight;
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      }, "image/jpeg", 0.92);
    };
    img.onerror = reject;
    img.src = base64.startsWith("data:") ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/** Inject EXIF into a JPEG blob and return a new Blob */
function injectExif(
  jpegBlob: Blob,
  dogId: string,
  latitude?: number | null,
  longitude?: number | null
): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result as string;
        const exifObj: { "0th"?: Record<number, unknown>; Exif?: Record<number, unknown>; GPS?: Record<number, unknown> } = {
          "0th": {
            [piexif.ImageIFD.ImageDescription]: dogId,
            [piexif.ImageIFD.Software]: "ABC Buddy",
          },
          Exif: {},
          GPS: {},
        };

        if (latitude != null && longitude != null) {
          exifObj.GPS = {
            [piexif.GPSIFD.GPSLatitudeRef]: latitude >= 0 ? "N" : "S",
            [piexif.GPSIFD.GPSLatitude]: toExifGps(latitude),
            [piexif.GPSIFD.GPSLongitudeRef]: longitude >= 0 ? "E" : "W",
            [piexif.GPSIFD.GPSLongitude]: toExifGps(longitude),
          };
        }

        const exifBytes = piexif.dump(exifObj);
        const inserted = piexif.insert(exifBytes, dataUrl);
        // Convert data URL back to Blob
        const binary = atob(inserted.split(",")[1]);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        resolve(new Blob([arr], { type: "image/jpeg" }));
      } catch {
        // EXIF injection failed — return original blob unchanged
        resolve(jpegBlob);
      }
    };
    reader.onerror = () => resolve(jpegBlob);
    reader.readAsDataURL(jpegBlob);
  });
}

/** Main entry point — call this in parallel with the save flow */
export async function annotateAndShare(payload: SharePayload): Promise<void> {
  try {
    const { imageBase64, dogId, latitude, longitude, areaName, recordedAt } = payload;

    // Step 1: Canvas annotation
    const annotatedBlob = await canvasAnnotate(
      imageBase64, dogId, areaName, latitude, longitude, recordedAt
    );

    // Step 2: EXIF injection
    const finalBlob = await injectExif(annotatedBlob, dogId, latitude, longitude);

    const fileName = `${dogId}.jpg`;
    const file = new File([finalBlob], fileName, { type: "image/jpeg" });

    // Step 3: Web Share API (with fallback to download link)
    if (
      typeof navigator.share === "function" &&
      navigator.canShare?.({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
        title: dogId,
      });
    } else {
      // Fallback: trigger download
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch (err: unknown) {
    // User cancelled share or browser error — swallow silently
    if (err instanceof Error && err.name === "AbortError") return;
    console.warn("[annotateAndShare] failed:", err);
  }
}
