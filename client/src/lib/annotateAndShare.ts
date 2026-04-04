/**
 * annotateAndShare
 *
 * Parallel share flow — completely independent of the IndexedDB / server save path.
 *
 * 1. Draws the raw JPEG onto a Canvas and overlays a text strip (dog ID, date, area, lat/lng).
 * 2. Injects EXIF GPS + ImageDescription tags using pure browser DataView (no external lib).
 * 3. Calls navigator.share({ files }) so the user can save to Photos / WhatsApp / etc.
 * 4. Falls back to a plain <a download> link on browsers that don't support Web Share.
 *
 * Errors are swallowed silently — this flow must never interfere with the main save.
 */

export interface SharePayload {
  imageBase64: string;   // data:image/jpeg;base64,... or raw base64
  dogId: string;
  latitude?: number | null;
  longitude?: number | null;
  areaName?: string;
  recordedAt?: number;   // UTC ms
}

// ---------------------------------------------------------------------------
// Minimal EXIF builder (no external dependency)
// ---------------------------------------------------------------------------

function writeUint16BE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, false);
}
function writeUint32BE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, false);
}

/** Encode a string as ASCII bytes */
function asciiBytes(s: string): Uint8Array {
  const arr = new Uint8Array(s.length + 1); // null-terminated
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) & 0xff;
  return arr;
}

/** Convert decimal degrees to EXIF rational triple [deg, min, sec*100] as Uint32 pairs */
function toRationals(decimal: number): number[] {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFull = (abs - deg) * 60;
  const min = Math.floor(minFull);
  const sec = Math.round((minFull - min) * 6000); // sec * 100
  // Each rational is [numerator, denominator]
  return [deg, 1, min, 1, sec, 100];
}

/**
 * Build a minimal EXIF APP1 segment with:
 *   - 0th IFD: ImageDescription, Software
 *   - GPS IFD: GPSLatitudeRef, GPSLatitude, GPSLongitudeRef, GPSLongitude
 *
 * Returns a Uint8Array starting with 0xFF 0xE1 (APP1 marker) ready to splice
 * into a JPEG after the SOI marker.
 */
function buildExifApp1(
  dogId: string,
  latitude?: number | null,
  longitude?: number | null
): Uint8Array {
  // We build the EXIF data in a simple linear fashion.
  // EXIF = "Exif\0\0" + TIFF header + IFD0 + GPS IFD

  const descBytes = asciiBytes(dogId.slice(0, 255));
  const softBytes = asciiBytes("ABC Buddy");

  const hasGps = latitude != null && longitude != null;

  // IFD entry count
  const ifd0EntryCount = hasGps ? 3 : 2; // ImageDescription, Software, [GPSInfoIFD]
  const gpsEntryCount = hasGps ? 4 : 0;  // GPSLatitudeRef, GPSLatitude, GPSLongitudeRef, GPSLongitude

  // Offsets (all relative to start of TIFF header = byte 6 of APP1 data)
  const TIFF_HDR_SIZE = 8;            // "II" + 0x002A + offset to IFD0 (4 bytes)
  const IFD_ENTRY_SIZE = 12;
  const IFD_HEADER_SIZE = 2;          // entry count (uint16)
  const IFD_FOOTER_SIZE = 4;          // next IFD offset (uint32)

  const ifd0Offset = TIFF_HDR_SIZE;
  const ifd0Size = IFD_HEADER_SIZE + ifd0EntryCount * IFD_ENTRY_SIZE + IFD_FOOTER_SIZE;

  const gpsIfdOffset = ifd0Offset + ifd0Size;
  const gpsIfdSize = hasGps
    ? IFD_HEADER_SIZE + gpsEntryCount * IFD_ENTRY_SIZE + IFD_FOOTER_SIZE
    : 0;

  // Value area starts after all IFDs
  const valueAreaOffset = gpsIfdOffset + gpsIfdSize;

  // Compute sizes of variable-length values
  const descOffset = valueAreaOffset;          // relative to TIFF start
  const descSize = descBytes.length;

  const softOffset = descOffset + descSize;
  const softSize = softBytes.length;

  // GPS rational values (each rational = 2 uint32 = 8 bytes; 3 rationals = 24 bytes)
  const latRefOffset = softOffset + softSize;   // 2 bytes (ASCII "N\0" or "S\0")
  const latValOffset = latRefOffset + 2;        // 24 bytes (3 rationals)
  const lngRefOffset = latValOffset + 24;       // 2 bytes
  const lngValOffset = lngRefOffset + 2;        // 24 bytes

  const totalTiffSize = lngValOffset + (hasGps ? 24 : 0);

  // APP1 = marker(2) + length(2) + "Exif\0\0"(6) + TIFF(totalTiffSize)
  const app1DataSize = 6 + totalTiffSize;
  const app1TotalSize = 2 + 2 + app1DataSize; // marker + length field + data

  const buf = new ArrayBuffer(app1TotalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  let p = 0;

  // APP1 marker
  view.setUint8(p++, 0xFF);
  view.setUint8(p++, 0xE1);

  // APP1 length (big-endian, includes the 2-byte length field itself)
  writeUint16BE(view, p, app1DataSize + 2); p += 2;

  // "Exif\0\0"
  bytes.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], p); p += 6;

  // --- TIFF header (little-endian) ---
  const tiffStart = p;
  bytes.set([0x49, 0x49], p); p += 2; // "II" = little-endian
  view.setUint16(p, 0x002A, true); p += 2; // magic
  view.setUint32(p, ifd0Offset, true); p += 4; // offset to IFD0

  // Helper: write IFD entry (little-endian)
  function writeEntry(tag: number, type: number, count: number, valueOrOffset: number) {
    view.setUint16(p, tag, true); p += 2;
    view.setUint16(p, type, true); p += 2;
    view.setUint32(p, count, true); p += 4;
    view.setUint32(p, valueOrOffset, true); p += 4;
  }

  // --- IFD0 ---
  view.setUint16(p, ifd0EntryCount, true); p += 2;

  // Tag 0x010E: ImageDescription (type=2 ASCII)
  writeEntry(0x010E, 2, descSize, descOffset);
  // Tag 0x0131: Software (type=2 ASCII)
  writeEntry(0x0131, 2, softSize, softOffset);
  // Tag 0x8825: GPSInfoIFD (type=4 LONG)
  if (hasGps) writeEntry(0x8825, 4, 1, gpsIfdOffset);

  // Next IFD offset = 0 (no IFD1)
  view.setUint32(p, 0, true); p += 4;

  // --- GPS IFD ---
  if (hasGps) {
    view.setUint16(p, gpsEntryCount, true); p += 2;
    // Tag 0x0001: GPSLatitudeRef (type=2 ASCII, count=2)
    writeEntry(0x0001, 2, 2, latRefOffset);
    // Tag 0x0002: GPSLatitude (type=5 RATIONAL, count=3)
    writeEntry(0x0002, 5, 3, latValOffset);
    // Tag 0x0003: GPSLongitudeRef (type=2 ASCII, count=2)
    writeEntry(0x0003, 2, 2, lngRefOffset);
    // Tag 0x0004: GPSLongitude (type=5 RATIONAL, count=3)
    writeEntry(0x0004, 5, 3, lngValOffset);
    view.setUint32(p, 0, true); p += 4;
  }

  // --- Value area ---
  // ImageDescription
  bytes.set(descBytes, tiffStart + descOffset); p += descSize;
  // Software
  bytes.set(softBytes, tiffStart + softOffset); p += softSize;

  if (hasGps && latitude != null && longitude != null) {
    const lat = latitude;
    const lng = longitude;

    // LatRef
    bytes[tiffStart + latRefOffset] = lat >= 0 ? 0x4E : 0x53; // N or S
    bytes[tiffStart + latRefOffset + 1] = 0x00;
    p += 2;

    // Lat rationals
    const latR = toRationals(lat);
    for (let i = 0; i < 6; i++) {
      view.setUint32(tiffStart + latValOffset + i * 4, latR[i], true);
    }
    p += 24;

    // LngRef
    bytes[tiffStart + lngRefOffset] = lng >= 0 ? 0x45 : 0x57; // E or W
    bytes[tiffStart + lngRefOffset + 1] = 0x00;
    p += 2;

    // Lng rationals
    const lngR = toRationals(lng);
    for (let i = 0; i < 6; i++) {
      view.setUint32(tiffStart + lngValOffset + i * 4, lngR[i], true);
    }
    p += 24;
  }

  return new Uint8Array(buf);
}

/**
 * Splice EXIF APP1 segment into a JPEG blob.
 * JPEG structure: SOI(FFD8) [APP0(FFE0)...] image data [EOI(FFD9)]
 * We insert APP1 right after SOI, replacing any existing APP1.
 */
async function injectExif(
  jpegBlob: Blob,
  dogId: string,
  latitude?: number | null,
  longitude?: number | null
): Promise<Blob> {
  try {
    const srcBuf = await jpegBlob.arrayBuffer();
    const src = new Uint8Array(srcBuf);

    // Verify SOI
    if (src[0] !== 0xFF || src[1] !== 0xD8) return jpegBlob;

    // Find where to insert: skip SOI (2 bytes), skip any existing APP0/APP1 segments
    let insertAt = 2;
    while (insertAt < src.length - 1) {
      if (src[insertAt] !== 0xFF) break;
      const marker = src[insertAt + 1];
      // APP0=E0, APP1=E1 — skip these; stop at anything else
      if (marker !== 0xE0 && marker !== 0xE1) break;
      const segLen = (src[insertAt + 2] << 8) | src[insertAt + 3];
      insertAt += 2 + segLen;
    }

    const exifApp1 = buildExifApp1(dogId, latitude, longitude);

    // Reassemble: SOI + EXIF APP1 + rest of JPEG (from insertAt)
    const result = new Uint8Array(2 + exifApp1.length + (src.length - insertAt));
    result.set(src.slice(0, 2), 0);                    // SOI
    result.set(exifApp1, 2);                            // our APP1
    result.set(src.slice(insertAt), 2 + exifApp1.length); // rest

    return new Blob([result], { type: "image/jpeg" });
  } catch {
    return jpegBlob;
  }
}

// ---------------------------------------------------------------------------
// Canvas annotation
// ---------------------------------------------------------------------------

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

      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, H - overlayH, W, overlayH);

      ctx.fillStyle = "#FFE600";
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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Call this in parallel with the save flow — errors are swallowed silently */
export async function annotateAndShare(payload: SharePayload): Promise<void> {
  try {
    const { imageBase64, dogId, latitude, longitude, areaName, recordedAt } = payload;

    const annotatedBlob = await canvasAnnotate(
      imageBase64, dogId, areaName, latitude, longitude, recordedAt
    );

    const finalBlob = await injectExif(annotatedBlob, dogId, latitude, longitude);

    const fileName = `${dogId}.jpg`;
    const file = new File([finalBlob], fileName, { type: "image/jpeg" });

    if (
      typeof navigator.share === "function" &&
      navigator.canShare?.({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: dogId });
    } else {
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return;
    console.warn("[annotateAndShare] failed:", err);
  }
}
