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
  deleteRecordById,
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

1. Describe the dog in detail for an animal welfare record: approximate breed or breed mix, primary and secondary colours, distinctive markings (patches, spots, scars), approximate size (small/medium/large), body condition (thin/normal/overweight), approximate age (puppy/young/adult/senior), and any notable features (collar, injuries, ear tags). Be concise but thorough.

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
                text: "Describe this dog in detail for an animal welfare record. Include: approximate breed or breed mix, primary and secondary colors, distinctive markings (patches, spots, scars), approximate size (small/medium/large), body condition (thin/normal/overweight), approximate age (puppy/young/adult/senior), and any notable features (collar, injuries, ear tags). Be concise but thorough. Respond in plain text, no markdown.",
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
      // Dynamic import for canvas (native module)
      const { createCanvas, loadImage } = await import("canvas");

      const imgBuffer = Buffer.from(input.imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
      const img = await loadImage(imgBuffer);

      const W = img.width;
      const H = img.height;

      // Build text lines
      const date = new Date(input.recordedAt);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayName = days[date.getDay()];
      const dateStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

      const lines: { text: string; bold: boolean; italic: boolean }[] = [];
      lines.push({ text: `${input.dogId} · ${dayName}`, bold: true, italic: false });
      lines.push({ text: `${dateStr}, ${timeStr}`, bold: false, italic: false });
      if (input.areaName) {
        lines.push({ text: input.areaName, bold: false, italic: false });
      }
      if (input.latitude != null && input.longitude != null) {
        lines.push({ text: `${input.latitude.toFixed(5)}, ${input.longitude.toFixed(5)}`, bold: false, italic: false });
      }
      if (input.notes) {
        // Wrap notes to ~50 chars per line
        const words = input.notes.split(" ");
        let current = "";
        for (const word of words) {
          if ((current + " " + word).trim().length > 50) {
            lines.push({ text: current.trim(), bold: false, italic: true });
            current = word;
          } else {
            current = current ? current + " " + word : word;
          }
        }
        if (current.trim()) {
          lines.push({ text: current.trim(), bold: false, italic: true });
        }
      }

      // Calculate overlay dimensions
      const idFontSize = Math.round(W * 0.038);
      const lineFontSize = Math.round(W * 0.030);
      const lineHeight = lineFontSize * 1.4;
      const padding = Math.round(W * 0.02);
      const overlayHeight = padding * 2 + idFontSize * 1.4 + (lines.length - 1) * lineHeight;

      // Create canvas
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // Dark overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(0, H - overlayHeight, W, overlayHeight);

      // Draw text
      let y = H - overlayHeight + padding;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const size = i === 0 ? idFontSize : lineFontSize;
        const style = line.bold ? "bold" : line.italic ? "italic" : "";
        ctx.font = `${style} ${size}px sans-serif`.trim();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(line.text, padding, y + size);
        y += i === 0 ? idFontSize * 1.4 : lineHeight;
      }

      const annotatedBase64 = canvas.toBuffer("image/jpeg", { quality: 0.92 }).toString("base64");
      return { annotatedBase64: `data:image/jpeg;base64,${annotatedBase64}` };
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
      // Upload annotated image to S3
      const imgBuffer = Buffer.from(
        input.imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );
      const suffix = nanoid(8);
      const fileKey = `dogs/${input.teamIdentifier}/${input.dogId}-${suffix}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imgBuffer, "image/jpeg");

      // Upload original image if provided
      let originalImageUrl: string | undefined;
      if (input.originalImageBase64) {
        const origBuffer = Buffer.from(
          input.originalImageBase64.replace(/^data:image\/\w+;base64,/, ""),
          "base64"
        );
        const origKey = `dogs/${input.teamIdentifier}/${input.dogId}-original-${suffix}.jpg`;
        const { url } = await storagePut(origKey, origBuffer, "image/jpeg");
        originalImageUrl = url;
      }

      // Insert record
      const record = await insertDogRecord({
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

      // Fire webhook (non-blocking)
      if (input.webhookUrl) {
        try {
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
        } catch (e) {
          console.error("Webhook error:", e);
        }
      }

      return record;
    }),

  getRecords: publicProcedure
    .input(z.object({ teamIdentifier: z.string() }))
    .query(async ({ input }) => {
      return getRecordsByTeam(input.teamIdentifier);
    }),

  deleteRecord: publicProcedure
    .input(z.object({ id: z.number(), teamIdentifier: z.string() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteRecordById(input.id, input.teamIdentifier);
      return { success: deleted };
    }),

  lookupDog: publicProcedure
    .input(
      z.object({
        teamIdentifier: z.string(),
        imageBase64: z.string(),
        timeRange: z.enum(["3days", "7days", "30days"]),
      })
    )
    .mutation(async ({ input }) => {
      // Determine date filter
      let sinceDate: Date | undefined;
      const now = new Date();
      if (input.timeRange === "3days") {
        sinceDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      } else if (input.timeRange === "7days") {
        sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (input.timeRange === "30days") {
        sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const records = await getRecordsByTeamWithTimeRange(input.teamIdentifier, sinceDate);

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
});

export type AppRouter = typeof appRouter;
