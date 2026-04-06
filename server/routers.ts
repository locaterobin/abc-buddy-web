import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getNextDogIdSuffix,
  checkDogIdExists,
  insertDogRecord,
  getRecordsByTeam,
  getRecordsByTeamWithTimeRange,
  getRecordsPaginated,
  deleteRecordById,
  saveReleaseData,
  getRecordDates,
  getReleasePlans,
  createReleasePlan,
  deleteReleasePlan,
  getReleasePlanDogs,
  addDogToReleasePlan,
  removeDogFromReleasePlan,
  getDogPlanDetails,
  moveDogToPlan,
  getDogReleasePlans,
  getFullRecordByDogId,
  reorderPlanDogs,
  updatePlanAfterRelease,
  getDogIdByRecordId,
  archiveReleasePlan,
  getTeamDocxTemplateUrl,
  saveTeamDocxTemplateUrl,
  updateDogRecordAnnotation,
  getRecordByDogId,
  updateDogRecord,
  updateCheckedPhotoUrl,
} from "./db";
import { getDb } from "./db";
import { loginAttempts, blockedIps, dogRecords, releasePlans } from "../drizzle/schema";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { createOpenAI } from "@ai-sdk/openai";
import { createPatchedFetch } from "./_core/patchedFetch";
import { generateText } from "ai";

// ─── AI Setup ───
const openai = createOpenAI({
  apiKey: process.env.BUILT_IN_FORGE_API_KEY,
  baseURL: `${process.env.BUILT_IN_FORGE_API_URL}/v1`,
  fetch: createPatchedFetch(fetch),
});

// ─── Team ID Generation ───
const ADJECTIVES = [
  "swift", "brave", "calm", "bold", "keen", "wild", "warm", "cool", "fair", "wise",
  "glad", "free", "pure", "soft", "kind", "deep", "true", "rare", "safe", "fast",
  "bright", "gentle", "happy", "lucky", "noble", "quiet", "sharp", "steady", "strong", "vivid",
];
const NOUNS = [
  "falcon", "tiger", "eagle", "panda", "otter", "whale", "robin", "crane", "bison", "coral",
  "cedar", "maple", "river", "storm", "flame", "frost", "pearl", "stone", "brook", "ridge",
  "penguin", "dolphin", "sparrow", "panther", "phoenix", "turtle", "raven", "coyote", "badger", "heron",
];

function generateTeamSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

// ─── Dogs Router ───
const dogsRouter = router({
  generateTeamId: publicProcedure.mutation(() => {
    return { teamId: generateTeamSlug() };
  }),

  getNextSuffix: publicProcedure
    .input(z.object({ teamIdentifier: z.string(), datePrefix: z.string(), planLetter: z.string().optional() }))
    .query(async ({ input }) => {
      const suffix = await getNextDogIdSuffix(input.teamIdentifier, input.datePrefix, input.planLetter);
      return { suffix };
    }),

  checkDogId: publicProcedure
    .input(z.object({ teamIdentifier: z.string(), dogId: z.string() }))
    .query(async ({ input }) => {
      const exists = await checkDogIdExists(input.teamIdentifier, input.dogId);
      return { exists };
    }),

  analyzeImage: publicProcedure
    .input(z.object({
      imageBase64: z.string(),
      extractMetadata: z.boolean().optional(), // true = also extract burnt-in GPS/date/place
    }))
    .mutation(async ({ input }) => {
      const model = openai.chat("gpt-4o");

      if (input.extractMetadata) {
        // Two-part prompt: describe the dog AND extract any burnt-in metadata
        const result = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", image: input.imageBase64 },
                {
                  type: "text",
                  text: `You are analysing a field photo of a dog. Do two things:

1. Describe the dog briefly for an animal welfare record. Only include what is clearly visible. Cover: color(s), any distinguishing features (markings, scars, injuries), build (small/medium/large, thin/normal/stocky), and breed only if clearly not mixed. Omit anything uncertain. Never mention absent features (no collar, no markings, etc.). 1-2 sentences max.

2. Look carefully at the image for any text, watermarks, or data overlaid/burnt into the photo — such as GPS coordinates, a date/time stamp, a location name, or any notes. Extract whatever you can find.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "description": "<dog description here>",
  "latitude": <number or null>,
  "longitude": <number or null>,
  "recordedAt": "<ISO 8601 datetime string or null>",
  "areaName": "<place name or null>",
  "notes": "<any other burnt-in text or null>"
}`,
                },
              ],
            },
          ],
        });

        try {
          const text = result.text.trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              description: parsed.description || "",
              latitude: typeof parsed.latitude === "number" ? parsed.latitude : null,
              longitude: typeof parsed.longitude === "number" ? parsed.longitude : null,
              recordedAt: parsed.recordedAt || null,
              areaName: parsed.areaName || null,
              notes: parsed.notes || null,
            };
          }
        } catch (e) {
          console.error("Failed to parse metadata JSON:", e);
        }
        // Fallback: return just the text as description
        return { description: result.text, latitude: null, longitude: null, recordedAt: null, areaName: null, notes: null };
      }

      // Camera mode: just describe the dog
      const result = await generateText({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: input.imageBase64 },
              {
                type: "text",
                text: "Describe this dog briefly for an animal welfare record. Only include what is clearly visible. Cover: color(s), any distinguishing features (markings, scars, injuries), build (small/medium/large, thin/normal/stocky), and breed only if clearly not mixed. Omit anything uncertain. Never mention absent features (no collar, no markings, etc.). Plain text only, 1-2 sentences max.",
              },
            ],
          },
        ],
      });
      return { description: result.text, latitude: null, longitude: null, recordedAt: null, areaName: null, notes: null };
    }),

  geocodeLatLng: publicProcedure
    .input(z.object({ latitude: z.number(), longitude: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY not set");
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${input.latitude},${input.longitude}&key=${apiKey}&result_type=route|sublocality|locality`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Geocoding failed");
        const data = await res.json();
        if (data.status !== "OK" || !data.results?.length) throw new Error(`Geocoding status: ${data.status}`);
        // Build a concise area name: Locality first, then Route
        const components = data.results[0].address_components as Array<{ long_name: string; types: string[] }>;
        const get = (type: string) => components.find((c) => c.types.includes(type))?.long_name ?? "";
        const road = get("route") || get("sublocality_level_1") || get("sublocality");
        const locality = get("locality") || get("administrative_area_level_3") || get("administrative_area_level_2");
        const parts = [locality, road].filter(Boolean); // locality first
        const areaName = parts.join(", ") || data.results[0].formatted_address || "Unknown location";
        // District and state+country (hidden from UI, stored in DB + sent in webhook)
        const district = get("administrative_area_level_3") || get("administrative_area_level_2") || "";
        const state = get("administrative_area_level_1");
        const country = get("country");
        const adminArea = [district, state, country].filter(Boolean).join(", ");
        return { areaName, district, adminArea };
      } catch (e) {
        console.error("Geocoding error:", e);
        return { areaName: "" };
      }
    }),

  annotateRecord: publicProcedure
    .input(
      z.object({
        imageBase64: z.string(),
        dogId: z.string(),
        recordedAt: z.string(),
        areaName: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const sharp = (await import("sharp")).default;

      const imgBuffer = Buffer.from(input.imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");

      // autoOrient fixes portrait photos taken on mobile that have EXIF rotation tags
      const image = sharp(imgBuffer).autoOrient();
      const meta = await image.clone().metadata();
      const W = meta.width || 800;
      const H = meta.height || 600;

      // Build text lines
      const date = new Date(input.recordedAt);
      const IST = "Asia/Kolkata";
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      // Use IST explicitly so the annotation is correct regardless of server timezone
      const dayName = days[new Date(date.toLocaleString("en-US", { timeZone: IST })).getDay()];
      const dateStr = date.toLocaleDateString("en-GB", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });
      const timeStr = date.toLocaleTimeString("en-US", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true });

      type Line = { text: string; bold: boolean };
      const lines: Line[] = [];
      lines.push({ text: `${input.dogId}`, bold: true });
      lines.push({ text: `${dayName}, ${dateStr}, ${timeStr}`, bold: false });
      if (input.areaName) lines.push({ text: input.areaName, bold: false });
      if (input.latitude != null && input.longitude != null) {
        lines.push({ text: `${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`, bold: false });
      }
      if (input.notes) {
        const words = input.notes.split(" ");
        let current = "";
        for (const word of words) {
          if ((current + " " + word).trim().length > 50) {
            lines.push({ text: current.trim(), bold: false });
            current = word;
          } else {
            current = current ? current + " " + word : word;
          }
        }
        if (current.trim()) lines.push({ text: current.trim(), bold: false });
      }

      // Font sizes proportional to image width
      const idFontSize = Math.max(18, Math.round(W * 0.038));
      const lineFontSize = Math.max(14, Math.round(W * 0.030));
      const lineHeight = Math.round(lineFontSize * 1.6);
      const padding = Math.max(10, Math.round(W * 0.025));

      // Calculate total overlay height
      const overlayHeight = padding * 2 + idFontSize + (lines.length - 1) * lineHeight + Math.round(lineHeight * 0.3);

      // Escape XML special chars for SVG
      const escXml = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      // Build SVG using system font name — Liberation Sans is installed on both dev and deployment
      let svgLines = "";
      let y = padding + idFontSize;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const size = i === 0 ? idFontSize : lineFontSize;
        const weight = line.bold ? "bold" : "normal";
        svgLines += `<text x="${padding}" y="${y}" font-family="Liberation Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="white">${escXml(line.text)}</text>\n`;
        y += i === 0 ? idFontSize + Math.round(lineHeight * 0.4) : lineHeight;
      }

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${overlayHeight}">
  <rect width="${W}" height="${overlayHeight}" fill="rgba(0,0,0,0.65)"/>
  ${svgLines}
</svg>`;

      // Composite the SVG strip onto the bottom of the correctly-oriented image
      const annotatedBuffer = await image
        .composite([{ input: Buffer.from(svg), top: H - overlayHeight, left: 0 }])
        .jpeg({ quality: 92 })
        .toBuffer();

      return { annotatedBase64: `data:image/jpeg;base64,${annotatedBuffer.toString("base64")}` };
    }),

  saveRecord: publicProcedure
    .input(
      z.object({
        teamIdentifier: z.string(),
        dogId: z.string(),
        imageBase64: z.string(),
        originalImageBase64: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        areaName: z.string().optional(),
        district: z.string().optional(),
        adminArea: z.string().optional(),
        source: z.enum(["camera", "upload"]).default("upload"),
        recordedAt: z.number(), // unix timestamp ms
        webhookUrl: z.string().optional(),
        addedByStaffId: z.string().optional(),
        addedByStaffName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Phase 1 (synchronous): S3 upload + DB insert — client waits for this before clearing queue.
      // Phase 2 (fire-and-forget): annotation, AI description, geocoding, webhooks.
      const suffix = nanoid(8);
      const fileKey = `dogs/${input.teamIdentifier}/${input.dogId}-${suffix}.jpg`;
      const origKey = input.originalImageBase64
        ? `dogs/${input.teamIdentifier}/${input.dogId}-original-${suffix}.jpg`
        : null;

      console.log(`[saveRecord] start dogId=${input.dogId}`);
      const imgBuffer = Buffer.from(
        input.imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );
      console.log(`[saveRecord] uploading image to S3 key=${fileKey}`);
      const { url: imageUrl } = await storagePut(fileKey, imgBuffer, "image/jpeg");
      console.log(`[saveRecord] S3 upload done imageUrl=${imageUrl}`);

      let originalImageUrl: string | undefined;
      if (input.originalImageBase64 && origKey) {
        const origBuffer = Buffer.from(
          input.originalImageBase64.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        const { url } = await storagePut(origKey, origBuffer, "image/jpeg");
        originalImageUrl = url;
      }

      // Resolve dogId — auto-increment suffix if there's a collision (race condition between concurrent saves)
      let resolvedDogId = input.dogId;
      const existing = await getRecordByDogId(resolvedDogId, input.teamIdentifier);
      if (existing) {
        const parts = resolvedDogId.split("-");
        const datePrefix = parts[0];
        const newSuffix = await getNextDogIdSuffix(input.teamIdentifier, datePrefix);
        resolvedDogId = `${datePrefix}-${newSuffix}`;
        console.warn(`[saveRecord] Collision on ${input.dogId}, reassigned to ${resolvedDogId}`);
      }

      console.log(`[saveRecord] inserting DB record resolvedDogId=${resolvedDogId}`);
      const savedRecord = await insertDogRecord({
        teamIdentifier: input.teamIdentifier,
        dogId: resolvedDogId,
        imageUrl,
        originalImageUrl: originalImageUrl ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        areaName: input.areaName ?? null,
        district: input.district ?? null,
        adminArea: input.adminArea ?? null,
        source: input.source,
        recordedAt: new Date(input.recordedAt),
        addedByStaffId: input.addedByStaffId ?? null,
        addedByStaffName: input.addedByStaffName ?? null,
      });
      console.log(`[saveRecord] DB insert confirmed id=${savedRecord.id} dogId=${resolvedDogId}`);

      // Phase 2: fire-and-forget background tasks (annotation, AI description, single update webhook)
      Promise.resolve().then(async () => {
        try {
          let annotatedUrl: string | null = null;
          let finalDescription: string | null = input.description ?? null;

          // Step 1: Annotate all images (camera and upload)
          try {
            const sharp = (await import("sharp")).default;
            const image = sharp(imgBuffer).autoOrient();
            const meta = await image.clone().metadata();
            const W = meta.width || 800;
            const H = meta.height || 600;
            const date = new Date(input.recordedAt);
            const IST = "Asia/Kolkata";
            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const dayName = days[new Date(date.toLocaleString("en-US", { timeZone: IST })).getDay()];
            const dateStr = date.toLocaleDateString("en-GB", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });
            const timeStr = date.toLocaleTimeString("en-US", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true });
            type Line = { text: string; bold: boolean };
            const lines: Line[] = [];
            lines.push({ text: `${resolvedDogId}`, bold: true });
            lines.push({ text: `${dayName}, ${dateStr}, ${timeStr}`, bold: false });
            if (input.areaName) lines.push({ text: input.areaName, bold: false });
            if (input.latitude != null && input.longitude != null) lines.push({ text: `${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`, bold: false });
            if (input.notes) {
              const words = input.notes.split(" ");
              let current = "";
              for (const word of words) {
                if ((current + " " + word).trim().length > 50) { lines.push({ text: current.trim(), bold: false }); current = word; }
                else { current = current ? current + " " + word : word; }
              }
              if (current.trim()) lines.push({ text: current.trim(), bold: false });
            }
            const idFontSize = Math.max(18, Math.round(W * 0.038));
            const lineFontSize = Math.max(14, Math.round(W * 0.030));
            const lineHeight = Math.round(lineFontSize * 1.6);
            const padding = Math.max(10, Math.round(W * 0.025));
            const overlayHeight = padding * 2 + idFontSize + (lines.length - 1) * lineHeight + Math.round(lineHeight * 0.3);
            const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            let svgLines = "";
            let y = padding + idFontSize;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const size = i === 0 ? idFontSize : lineFontSize;
              const weight = line.bold ? "bold" : "normal";
              svgLines += `<text x="${padding}" y="${y}" font-family="Liberation Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="white">${escXml(line.text)}</text>\n`;
              y += i === 0 ? idFontSize + Math.round(lineHeight * 0.4) : lineHeight;
            }
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${overlayHeight}"><rect width="${W}" height="${overlayHeight}" fill="rgba(0,0,0,0.65)"/>${svgLines}</svg>`;
            const annotatedBuffer = await image.composite([{ input: Buffer.from(svg), top: H - overlayHeight, left: 0 }]).jpeg({ quality: 92 }).toBuffer();
            const annotatedKey = `dogs/${input.teamIdentifier}/${resolvedDogId}-annotated-${nanoid(8)}.jpg`;
            const { url: aUrl } = await storagePut(annotatedKey, annotatedBuffer, "image/jpeg");
            annotatedUrl = aUrl;
            await updateDogRecordAnnotation(savedRecord.id, annotatedUrl, imageUrl, savedRecord.description ?? null, input.teamIdentifier);
            console.log(`[saveRecord BG] Annotation done annotatedUrl=${annotatedUrl}`);
          } catch (e) {
            console.error("[saveRecord BG] Annotation failed:", e);
          }

          // Step 2: AI description if empty — colour and distinct physical features only
          if (!finalDescription) {
            try {
              console.log(`[saveRecord BG] Generating AI description for ${resolvedDogId}`);
              const aiResult = await generateText({
                model: openai.chat("gpt-4o"),
                messages: [{
                  role: "user",
                  content: [
                    { type: "image", image: imageUrl },
                    { type: "text", text: "Describe this dog's physical appearance for an animal welfare record. Focus only on coat colour(s) and any clearly visible distinct features (markings, patches, scars, injuries). Do not mention age, breed, size, or build. Plain text only, 1 sentence max." },
                  ],
                }],
              });
              finalDescription = aiResult.text.trim() || null;
              console.log(`[saveRecord BG] AI description: ${finalDescription?.slice(0, 80)}`);
              if (finalDescription) {
                await updateDogRecord(savedRecord.id, input.teamIdentifier, { description: finalDescription });
              }
            } catch (e) {
              console.warn("[saveRecord BG] AI description failed:", e);
            }
          }

          // Step 3: Geocode backfill — only if lat/long present and areaName or adminArea is missing
          let finalAreaName = input.areaName ?? null;
          let finalDistrict = input.district ?? null;
          let finalAdminArea = input.adminArea ?? null;
          if (
            input.latitude != null &&
            input.longitude != null &&
            (!finalAreaName || !finalAdminArea)
          ) {
            try {
              console.log(`[saveRecord BG] Geocode backfill for ${resolvedDogId}`);
              const apiKey = process.env.GOOGLE_MAPS_API_KEY;
              if (apiKey) {
                const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${input.latitude},${input.longitude}&key=${apiKey}&result_type=route|sublocality|locality`;
                const geoRes = await fetch(geoUrl);
                if (geoRes.ok) {
                  const geoData = await geoRes.json();
                  if (geoData.status === "OK" && geoData.results?.length) {
                    const components = geoData.results[0].address_components as Array<{ long_name: string; types: string[] }>;
                    const get = (type: string) => components.find((c: { long_name: string; types: string[] }) => c.types.includes(type))?.long_name ?? "";
                    if (!finalAreaName) {
                      const road = get("route") || get("sublocality_level_1") || get("sublocality");
                      const locality = get("locality") || get("administrative_area_level_3") || get("administrative_area_level_2");
                      finalAreaName = [locality, road].filter(Boolean).join(", ") || geoData.results[0].formatted_address || null;
                    }
                    if (!finalDistrict) {
                      finalDistrict = get("administrative_area_level_3") || get("administrative_area_level_2") || null;
                    }
                    if (!finalAdminArea) {
                      const district = get("administrative_area_level_3") || get("administrative_area_level_2") || "";
                      const state = get("administrative_area_level_1");
                      const country = get("country");
                      finalAdminArea = [district, state, country].filter(Boolean).join(", ") || null;
                    }
                    // Update DB with backfilled values
                    const backfillUpdate: Record<string, unknown> = {};
                    if (!input.areaName && finalAreaName) backfillUpdate.areaName = finalAreaName;
                    if (!input.district && finalDistrict) backfillUpdate.district = finalDistrict;
                    if (!input.adminArea && finalAdminArea) backfillUpdate.adminArea = finalAdminArea;
                    if (Object.keys(backfillUpdate).length > 0) {
                      await updateDogRecord(savedRecord.id, input.teamIdentifier, backfillUpdate);
                      console.log(`[saveRecord BG] Geocode backfill saved: ${JSON.stringify(backfillUpdate)}`);
                    }
                  }
                }
              }
            } catch (e) {
              console.warn("[saveRecord BG] Geocode backfill failed:", e);
            }
          }

          // Step 4: Single update webhook with description, imageUrl, annotatedImageUrl, final geo fields
          if (input.webhookUrl) {
            fetch(`${input.webhookUrl}/update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "update",
                dogId: resolvedDogId,
                teamIdentifier: input.teamIdentifier,
                description: finalDescription ?? null,
                imageUrl,
                annotatedImageUrl: annotatedUrl ?? null,
                areaName: finalAreaName,
                district: finalDistrict,
                adminArea: finalAdminArea,
                latitude: input.latitude ?? null,
                longitude: input.longitude ?? null,
                notes: input.notes ?? null,
                recordedAt: new Date(input.recordedAt).toISOString(),
                addedByStaffId: input.addedByStaffId ?? null,
                addedByStaffName: input.addedByStaffName ?? null,
                source: input.source,
              }),
            }).catch((e) => console.warn("[saveRecord BG] update webhook failed:", e));
          }
        } catch (e) {
          console.error("[saveRecord BG] Error:", e);
          console.error("[saveRecord BG] Stack:", (e as any)?.stack);
        }
      });

      // Return after DB insert is confirmed — client can now safely clear the queue
      return { dogId: resolvedDogId, saved: true };
    }),

  getRecords: publicProcedure
    .input(z.object({ teamIdentifier: z.string() }))
    .query(async ({ input }) => {
      return getRecordsByTeam(input.teamIdentifier);
    }),

  getRecordsPaginated: publicProcedure
    .input(
      z.object({
        teamIdentifier: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        search: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        releasedDateFrom: z.string().optional(),
        releasedDateTo: z.string().optional(),
        status: z.enum(["all", "active", "released"]).default("all"),
      })
    )
    .query(async ({ input }) => {
      return getRecordsPaginated(input.teamIdentifier, {
        page: input.page,
        pageSize: input.pageSize,
        search: input.search,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        releasedDateFrom: input.releasedDateFrom,
        releasedDateTo: input.releasedDateTo,
        status: input.status,
      });
    }),

  deleteRecord: publicProcedure
    .input(z.object({ id: z.number(), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteRecordById(input.id, input.teamIdentifier);
      return { success: deleted };
    }),

  updateRecord: publicProcedure
    .input(
      z.object({
        id: z.number(),
        teamIdentifier: z.string(),
        // dogId, latitude, longitude, recordedAt are immutable — not accepted in updates
        description: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        areaName: z.string().nullable().optional(),
        gender: z.enum(["Unknown", "Male", "Female"]).optional(),
        updatedByStaffId: z.string().nullable().optional(),
        updatedByStaffName: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, teamIdentifier, ...rest } = input;
      const data: Parameters<typeof updateDogRecord>[2] = { ...rest, updatedAt: new Date() };
      const updated = await updateDogRecord(id, teamIdentifier, data);
      return { success: updated };
    }),

  saveRelease: publicProcedure
    .input(
      z.object({
        id: z.number(),
        teamIdentifier: z.string(),
        releasedAt: z.string(), // ISO string
        releaseLatitude: z.number().nullable(),
        releaseLongitude: z.number().nullable(),
        releaseAreaName: z.string().nullable(),
        releaseDistanceMetres: z.number().int().nullable(),
        photo3Base64: z.string().optional(), // optional release photo
        releasedByStaffId: z.string().nullable().optional(),
        releasedByStaffName: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      let releasePhotoUrl: string | undefined;
      if (input.photo3Base64) {
        const imgBuffer = Buffer.from(
          input.photo3Base64.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        const suffix = Math.random().toString(36).slice(2, 10);
        const fileKey = `release-photos/${input.teamIdentifier}/${input.id}-${suffix}.jpg`;
        const { url } = await storagePut(fileKey, imgBuffer, "image/jpeg");
        releasePhotoUrl = url;
      }
      const saved = await saveReleaseData(input.id, input.teamIdentifier, {
        releasedAt: new Date(input.releasedAt),
        releaseLatitude: input.releaseLatitude,
        releaseLongitude: input.releaseLongitude,
        releaseAreaName: input.releaseAreaName,
        releaseDistanceMetres: input.releaseDistanceMetres,
        releasePhotoUrl,
        releasedByStaffId: input.releasedByStaffId ?? null,
        releasedByStaffName: input.releasedByStaffName ?? null,
      });
      // Update plan timestamps (first/last release) — no auto-archive
      if (saved) {
        const dogIdForRecord = await getDogIdByRecordId(input.id);
        if (dogIdForRecord) {
          const planIdsForDog = await getDogReleasePlans(dogIdForRecord);
          for (const planId of planIdsForDog) {
            await updatePlanAfterRelease(planId);
          }
        }
      }
      return { success: saved, releasePhotoUrl: releasePhotoUrl ?? null };
    }),

  getRecordDates: publicProcedure
    .input(z.object({ teamIdentifier: z.string() }))
    .query(async ({ input }) => {
      const dates = await getRecordDates(input.teamIdentifier);
      return { dates };
    }),

  lookupDog: publicProcedure
    .input(
      z.object({
        teamIdentifier: z.string(),
        imageBase64: z.string(),
        // timeRange: preset window OR a specific YYYY-MM-DD date
        timeRange: z.union([z.enum(["7days", "30days"]), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
      })
    )
    .mutation(async ({ input }) => {
      // Determine date filter
      let sinceDate: Date | undefined;
      let untilDate: Date | undefined;
      const now = new Date();
      if (input.timeRange === "7days") {
        sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (input.timeRange === "30days") {
        sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        // Specific date: YYYY-MM-DD in IST — search that full IST day
        sinceDate = new Date(input.timeRange + "T00:00:00+05:30");
        untilDate = new Date(input.timeRange + "T23:59:59+05:30");
      }

      const records = await getRecordsByTeamWithTimeRange(input.teamIdentifier, sinceDate, untilDate);

      if (records.length === 0) {
        return { matches: [] };
      }

      // Build comparison prompt with up to 20 records at a time
      const batchSize = 20;
      const allMatches: Array<{
        recordId: number;
        confidence: "high" | "medium" | "low";
        reason: string;
      }> = [];

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        const imageContents: Array<{ type: "image"; image: string } | { type: "text"; text: string }> = [];
        imageContents.push({
          type: "image",
          image: input.imageBase64,
        });
        imageContents.push({
          type: "text",
          text: "This is the QUERY dog image. Compare it against the following recorded dogs and identify matches.",
        });

        for (const rec of batch) {
          if (rec.imageUrl) {
            imageContents.push({ type: "image", image: rec.imageUrl });
            imageContents.push({
              type: "text",
              text: `Record ID: ${rec.id}, Dog ID: ${rec.dogId}. Description: ${rec.description || "N/A"}`,
            });
          }
        }

        imageContents.push({
          type: "text",
          text: `Compare the QUERY dog image against each recorded dog. For each record that could be the same dog, provide a JSON array of matches. Each match should have: "recordId" (number), "confidence" ("high", "medium", or "low"), and "reason" (brief explanation). Only include records with at least low similarity. Return ONLY a valid JSON array, no other text. Example: [{"recordId": 1, "confidence": "high", "reason": "Same brown dog with white chest patch"}]`,
        });

        const model = openai.chat("gpt-4o");
        try {
          const result = await generateText({
            model,
            messages: [{ role: "user", content: imageContents }],
          });

          // Parse JSON from response
          const text = result.text.trim();
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            allMatches.push(...parsed);
          }
        } catch (e) {
          console.error("Lookup AI error:", e);
        }
      }

      // Sort by confidence
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      allMatches.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);

      // Attach full record data
      const matchesWithRecords = allMatches
        .map((m) => {
          const record = records.find((r) => r.id === m.recordId);
          if (!record) return null;
          return {
            record,
            confidence: m.confidence,
            reason: m.reason,
          };
        })
        .filter(Boolean);

      return { matches: matchesWithRecords };
    }),
});

const releasePlansRouter = router({
  getPlans: publicProcedure
    .input(z.object({ teamIdentifier: z.string(), sinceHours: z.number().optional() }))
    .query(async ({ input }) => {
      return getReleasePlans(input.teamIdentifier, input.sinceHours);
    }),
  createPlan: publicProcedure
    .input(z.object({ teamIdentifier: z.string(), planDate: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const id = await createReleasePlan(input.teamIdentifier, input.planDate, input.notes);
      return { id };
    }),
  deletePlan: publicProcedure
    .input(z.object({ planId: z.number(), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      return deleteReleasePlan(input.planId, input.teamIdentifier);
    }),
  getPlanDogs: publicProcedure
    .input(z.object({ planId: z.number(), teamIdentifier: z.string().optional() }))
    .query(async ({ input }) => {
      return getReleasePlanDogs(input.planId, input.teamIdentifier);
    }),
  addDog: publicProcedure
    .input(z.object({
      planId: z.number(),
      dogId: z.string(),
      photo2Base64: z.string().optional(), // data:image/jpeg;base64,...
      addedByStaffId: z.string().nullable().optional(),
      addedByStaffName: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      let photo2Url: string | undefined;
      if (input.photo2Base64) {
        const imgBuffer = Buffer.from(
          input.photo2Base64.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        const suffix = Math.random().toString(36).slice(2, 10);
        const fileKey = `release-plan-photos/${input.dogId}-${suffix}.jpg`;
        const { url } = await storagePut(fileKey, imgBuffer, "image/jpeg");
        photo2Url = url;
      }
      return addDogToReleasePlan(input.planId, input.dogId, photo2Url, input.addedByStaffId ?? null, input.addedByStaffName ?? null);
    }),
  removeDog: publicProcedure
    .input(z.object({ planId: z.number(), dogId: z.string(), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      // Verify plan belongs to team
      const plan = await db.select({ teamIdentifier: releasePlans.teamIdentifier }).from(releasePlans).where(eq(releasePlans.id, input.planId)).limit(1);
      if (!plan[0] || plan[0].teamIdentifier !== input.teamIdentifier) throw new TRPCError({ code: 'FORBIDDEN', message: 'Plan not found in your team' });
      // Verify dog belongs to team
      const dog = await db.select({ teamIdentifier: dogRecords.teamIdentifier }).from(dogRecords).where(and(eq(dogRecords.dogId, input.dogId), eq(dogRecords.teamIdentifier, input.teamIdentifier))).limit(1);
      if (!dog[0]) throw new TRPCError({ code: 'FORBIDDEN', message: 'Dog not found in your team' });
      return removeDogFromReleasePlan(input.planId, input.dogId);
    }),
  getDogPlans: publicProcedure
    .input(z.object({ dogId: z.string(), teamIdentifier: z.string().optional() }))
    .query(async ({ input }) => {
      return getDogReleasePlans(input.dogId, input.teamIdentifier);
    }),
  getDogPlanDetails: publicProcedure
    .input(z.object({ dogId: z.string(), teamIdentifier: z.string().optional() }))
    .query(async ({ input }) => {
      return getDogPlanDetails(input.dogId, input.teamIdentifier);
    }),
  moveDog: publicProcedure
    .input(z.object({
      dogId: z.string(),
      targetPlanId: z.number(),
      teamIdentifier: z.string(),
      movedByStaffId: z.string().nullable().optional(),
      movedByStaffName: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      // Verify target plan belongs to team
      const plan = await db.select({ teamIdentifier: releasePlans.teamIdentifier }).from(releasePlans).where(eq(releasePlans.id, input.targetPlanId)).limit(1);
      if (!plan[0] || plan[0].teamIdentifier !== input.teamIdentifier) throw new TRPCError({ code: 'FORBIDDEN', message: 'Target plan not found in your team' });
      // Verify dog belongs to team
      const dog = await db.select({ teamIdentifier: dogRecords.teamIdentifier }).from(dogRecords).where(and(eq(dogRecords.dogId, input.dogId), eq(dogRecords.teamIdentifier, input.teamIdentifier))).limit(1);
      if (!dog[0]) throw new TRPCError({ code: 'FORBIDDEN', message: 'Dog not found in your team' });
      await moveDogToPlan(input.dogId, input.targetPlanId, input.movedByStaffId ?? null, input.movedByStaffName ?? null);
      return { success: true };
    }),
  getFullRecord: publicProcedure
    .input(z.object({ dogId: z.string(), teamIdentifier: z.string().optional() }))
    .query(async ({ input }) => {
      return getFullRecordByDogId(input.dogId, input.teamIdentifier);
    }),
  updateCheckedPhoto: publicProcedure
    .input(z.object({
      dogId: z.string(),
      photo2Base64: z.string(), // base64 data URL
      teamIdentifier: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const imgBuffer = Buffer.from(
        input.photo2Base64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );
      const ext = input.photo2Base64.startsWith("data:image/png") ? "png" : "jpg";
      const key = `checked-photos/${input.dogId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, imgBuffer, `image/${ext}`);
      await updateCheckedPhotoUrl(input.dogId, url, input.teamIdentifier);
      return { url };
    }),
  reorderDogs: publicProcedure
    .input(z.object({ planId: z.number(), orderedDogIds: z.array(z.string()), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const plan = await db.select({ teamIdentifier: releasePlans.teamIdentifier }).from(releasePlans).where(eq(releasePlans.id, input.planId)).limit(1);
      if (!plan[0] || plan[0].teamIdentifier !== input.teamIdentifier) throw new TRPCError({ code: 'FORBIDDEN', message: 'Plan not found in your team' });
      await reorderPlanDogs(input.planId, input.orderedDogIds);
      return { success: true };
    }),
  archivePlan: publicProcedure
    .input(z.object({ planId: z.number(), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      await archiveReleasePlan(input.planId, input.teamIdentifier);
      return { success: true };
    }),
});

const settingsRouter = router({
  getDocxTemplate: publicProcedure
    .input(z.object({ teamIdentifier: z.string() }))
    .query(async ({ input }) => {
      const url = await getTeamDocxTemplateUrl(input.teamIdentifier);
      return { url };
    }),
  uploadDocxTemplate: publicProcedure
    .input(z.object({ teamIdentifier: z.string(), fileBase64: z.string(), fileName: z.string() }))
    .mutation(async ({ input }) => {
      const buf = Buffer.from(input.fileBase64, "base64");
      const key = `docx-templates/${input.teamIdentifier}/${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(key, buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      await saveTeamDocxTemplateUrl(input.teamIdentifier, url);
      return { url };
    }),
});

// ─── IP Rate Limiting Helpers ───
const MAX_FAILURES = 10;
const WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

function getClientIp(req: any): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

async function isIpBlocked(ip: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(blockedIps).where(eq(blockedIps.ip, ip)).limit(1);
  if (rows.length === 0) return false;
  const row = rows[0];
  // If unblockedAt is set and in the past, treat as unblocked
  if (row.unblockedAt && row.unblockedAt < new Date()) return false;
  return true;
}

async function recordLoginAttempt(ip: string, email: string, success: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(loginAttempts).values({ ip, email, success });
  if (!success) {
    // Count failures in the last 15 minutes
    const windowStart = new Date(Date.now() - WINDOW_MS);
    const result = await db
      .select({ cnt: count() })
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.success, false),
        gte(loginAttempts.attemptedAt, windowStart),
      ));
    const failures = Number(result[0]?.cnt ?? 0);
    if (failures >= MAX_FAILURES) {
      // Auto-block this IP
      await db.insert(blockedIps)
        .values({ ip, reason: `Auto-blocked after ${failures} failed login attempts` })
        .onDuplicateKeyUpdate({ set: { blockedAt: sql`NOW()`, unblockedAt: null, reason: sql`VALUES(reason)` } });
      // Notify the project owner immediately
      notifyOwner({
        title: "IP Auto-Blocked",
        content: `IP ${ip} was blocked after ${failures} failed login attempts within the past 2 hours. Email attempted: ${email}`,
      }).catch(() => {}); // fire-and-forget, don't block the response
      console.warn(`[Security] IP ${ip} auto-blocked after ${failures} failed login attempts`);
    }
  }
}

// ─── Airtable Login Router ───
const AIRTABLE_BASE = "appoMiBAQmtIDb1D2";
const STAFF_TABLE = "tbltkS9ncZmJbGaeh";
const TEAMS_TABLE = "tblG6klpIc4Eu948N";

const airtableLoginRouter = router({
  checkIpBlock: publicProcedure
    .query(async ({ ctx }) => {
      const ip = getClientIp(ctx.req);
      const blocked = await isIpBlocked(ip);
      return { blocked, ip };
    }),
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const ip = getClientIp(ctx.req);

      // Reject immediately if IP is blocked
      if (await isIpBlocked(ip)) {
        throw new Error("IP_BLOCKED");
      }

      const apiKey = process.env.AIRTABLE_API_TOKEN;
      if (!apiKey) throw new Error("Airtable API token not configured");

      // Query staff table for matching email
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${STAFF_TABLE}?filterByFormula=LOWER({Email})=LOWER('${input.email.replace(/'/g, "\\'")}')`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error("Failed to reach Airtable");
      const data = await res.json() as { records: Array<{ fields: Record<string, string> }> };

      if (!data.records || data.records.length === 0) {
        await recordLoginAttempt(ip, input.email, false);
        throw new Error("Invalid email or password");
      }

      const staff = data.records[0].fields;
      if (staff["Password"] !== input.password) {
        await recordLoginAttempt(ip, input.email, false);
        throw new Error("Invalid email or password");
      }

      const teamId = staff["TeamID"] ?? staff["Team ID"] ?? staff["teamid"] ?? "";

      // Look up Organization name, webhook URL, and form URL from teams table
      let orgName = "";
      let webhookUrl = "";
      let formUrl = "";
      if (teamId) {
        try {
          const teamUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TEAMS_TABLE}?filterByFormula={TeamID}='${teamId.replace(/'/g, "\\'")}'&maxRecords=1`;
          const teamRes = await fetch(teamUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
          if (teamRes.ok) {
            const teamData = await teamRes.json() as { records: Array<{ fields: Record<string, string> }> };
            if (teamData.records?.length > 0) {
              orgName = teamData.records[0].fields["Organization"] ?? teamData.records[0].fields["organisation"] ?? "";
              webhookUrl = teamData.records[0].fields["Webhook"] ?? teamData.records[0].fields["webhook"] ?? teamData.records[0].fields["WebhookURL"] ?? "";
              formUrl = teamData.records[0].fields["Form"] ?? teamData.records[0].fields["form"] ?? teamData.records[0].fields["FormURL"] ?? "";
            }
          }
        } catch { /* ignore, orgName stays empty */ }
      }

      // Record successful login
      await recordLoginAttempt(ip, input.email, true);

      // Return user session data
      return {
        name: staff["Name"] ?? staff["Full Name"] ?? "",
        staffId: staff["StaffID"] ?? staff["Staff ID"] ?? staff["staffid"] ?? "",
        role: staff["Role"] ?? staff["role"] ?? "",
        teamId,
        email: input.email,
        orgName,
        webhookUrl,
        formUrl,
      };
    }),
  // Refresh team data (webhookUrl, formUrl, orgName) using stored teamId — no password needed
  refreshSession: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.AIRTABLE_API_TOKEN;
      if (!apiKey) throw new Error("Airtable API token not configured");
      let webhookUrl = "";
      let formUrl = "";
      let orgName = "";
      try {
        const teamUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${TEAMS_TABLE}?filterByFormula={TeamID}='${input.teamId.replace(/'/g, "\\'")}' &maxRecords=1`;
        const teamRes = await fetch(teamUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (teamRes.ok) {
          const teamData = await teamRes.json() as { records: Array<{ fields: Record<string, string> }> };
          if (teamData.records?.length > 0) {
            orgName = teamData.records[0].fields["Organization"] ?? teamData.records[0].fields["organisation"] ?? "";
            webhookUrl = teamData.records[0].fields["Webhook"] ?? teamData.records[0].fields["webhook"] ?? teamData.records[0].fields["WebhookURL"] ?? "";
            formUrl = teamData.records[0].fields["Form"] ?? teamData.records[0].fields["form"] ?? teamData.records[0].fields["FormURL"] ?? "";
          }
        }
      } catch { /* ignore */ }
      return { webhookUrl, formUrl, orgName };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dogs: dogsRouter,
  releasePlans: releasePlansRouter,
  settings: settingsRouter,
  airtable: airtableLoginRouter,
  webhook: router({
    // Proxy a webhook call through the server to avoid CORS/mixed-content issues on mobile PWA
    fire: publicProcedure
      .input(z.object({
        url: z.string().url(),
        payload: z.record(z.string(), z.unknown()),
      }))
      .mutation(async ({ input }) => {
        try {
          const res = await fetch(input.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input.payload),
          });
          return { ok: res.ok, status: res.status };
        } catch (e: any) {
          console.warn("[webhook.fire] failed:", e?.message);
          return { ok: false, status: 0 };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
