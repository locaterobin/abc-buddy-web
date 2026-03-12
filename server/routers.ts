import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
  getDogReleasePlans,
  getFullRecordByDogId,
  reorderPlanDogs,
  updatePlanAfterRelease,
  getDogIdByRecordId,
  archiveReleasePlan,
} from "./db";
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
    .input(z.object({ teamIdentifier: z.string(), datePrefix: z.string() }))
    .query(async ({ input }) => {
      const suffix = await getNextDogIdSuffix(input.teamIdentifier, input.datePrefix);
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
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${input.latitude}&lon=${input.longitude}&zoom=16&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "User-Agent": "ABCBuddy/1.0" },
        });
        if (!res.ok) throw new Error("Geocoding failed");
        const data = await res.json();
        const addr = data.address || {};
        const parts = [
          addr.road,
          addr.neighbourhood || addr.suburb,
          addr.city || addr.town || addr.village,
        ].filter(Boolean);
        const areaName = parts.join(", ") || data.display_name || "Unknown location";
        return { areaName };
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
      lines.push({ text: `${input.dogId}  ${dayName}`, bold: true });
      lines.push({ text: `${dateStr}, ${timeStr}`, bold: false });
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
        source: z.enum(["camera", "upload"]).default("upload"),
        recordedAt: z.number(), // unix timestamp ms
        webhookUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Return immediately with a pending acknowledgement.
      // All heavy work (S3 upload, DB insert, webhook) runs in the background.
      const suffix = nanoid(8);
      const fileKey = `dogs/${input.teamIdentifier}/${input.dogId}-${suffix}.jpg`;
      const origKey = input.originalImageBase64
        ? `dogs/${input.teamIdentifier}/${input.dogId}-original-${suffix}.jpg`
        : null;

      // Fire-and-forget background task
      Promise.resolve().then(async () => {
        try {
          const imgBuffer = Buffer.from(
            input.imageBase64.replace(/^data:image\/\w+;base64,/, ""),
            "base64"
          );
          const { url: imageUrl } = await storagePut(fileKey, imgBuffer, "image/jpeg");

          let originalImageUrl: string | undefined;
          if (input.originalImageBase64 && origKey) {
            const origBuffer = Buffer.from(
              input.originalImageBase64.replace(/^data:image\/\w+;base64,/, ""),
              "base64"
            );
            const { url } = await storagePut(origKey, origBuffer, "image/jpeg");
            originalImageUrl = url;
          }

          await insertDogRecord({
            teamIdentifier: input.teamIdentifier,
            dogId: input.dogId,
            imageUrl,
            originalImageUrl: originalImageUrl ?? null,
            description: input.description ?? null,
            notes: input.notes ?? null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            areaName: input.areaName ?? null,
            source: input.source,
            recordedAt: new Date(input.recordedAt),
          });

          if (input.webhookUrl) {
            fetch(input.webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                dogId: input.dogId,
                teamIdentifier: input.teamIdentifier,
                recordedAt: new Date(input.recordedAt).toISOString(),
                latitude: input.latitude,
                longitude: input.longitude,
                areaName: input.areaName,
                description: input.description,
                notes: input.notes,
                imageUrl,
                source: input.source,
              }),
            }).catch((e) => console.error("Webhook failed:", e));
          }
        } catch (e) {
          console.error("[saveRecord background] Error:", e);
        }
      });

      // Return instantly — UI can reset immediately
      return { dogId: input.dogId, queued: true };
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
        status: input.status,
      });
    }),

  deleteRecord: publicProcedure
    .input(z.object({ id: z.number(), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteRecordById(input.id, input.teamIdentifier);
      return { success: deleted };
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
      return { success: saved };
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
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      return getReleasePlanDogs(input.planId);
    }),
  addDog: publicProcedure
    .input(z.object({
      planId: z.number(),
      dogId: z.string(),
      photo2Base64: z.string().optional(), // data:image/jpeg;base64,...
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
      return addDogToReleasePlan(input.planId, input.dogId, photo2Url);
    }),
  removeDog: publicProcedure
    .input(z.object({ planId: z.number(), dogId: z.string() }))
    .mutation(async ({ input }) => {
      return removeDogFromReleasePlan(input.planId, input.dogId);
    }),
  getDogPlans: publicProcedure
    .input(z.object({ dogId: z.string() }))
    .query(async ({ input }) => {
      return getDogReleasePlans(input.dogId);
    }),
  getFullRecord: publicProcedure
    .input(z.object({ dogId: z.string() }))
    .query(async ({ input }) => {
      return getFullRecordByDogId(input.dogId);
    }),
  reorderDogs: publicProcedure
    .input(z.object({ planId: z.number(), orderedDogIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
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
});

export type AppRouter = typeof appRouter;
