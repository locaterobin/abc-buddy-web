/**
 * POST /api/ingest
 *
 * REST endpoint for programmatic dog record creation.
 * Accepts an image + metadata, runs AI description, uploads to S3,
 * saves to DB, and fires the configured webhook.
 *
 * Authentication: X-API-Key header must match INGEST_API_KEY env var.
 *
 * Request body (JSON):
 * {
 *   "image":       "<base64-encoded image, with or without data URI prefix>",
 *   "teamId":      "bold-otter",           // required
 *   "gpsLat":      12.9716,                // required
 *   "gpsLng":      77.5946,                // required
 *   "areaName":    "Indiranagar, Bengaluru",// required
 *   "recordedAt":  "2025-03-08T10:30:00Z", // required, ISO 8601
 *   "notes":       "Near the park gate",   // optional
 *   "webhookUrl":  "https://..."           // optional, overrides default
 * }
 *
 * Response (200):
 * {
 *   "dogId":         "20250308-001",
 *   "imageUrl":      "https://...",
 *   "aiDescription": "...",
 *   "gpsLat":        12.9716,
 *   "gpsLng":        77.5946,
 *   "areaName":      "Indiranagar, Bengaluru",
 *   "recordedAt":    "2025-03-08T10:30:00.000Z",
 *   "notes":         "Near the park gate"
 * }
 */

import { Router, Request, Response } from "express";
import { nanoid } from "nanoid";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createPatchedFetch } from "./_core/patchedFetch";
import { storagePut } from "./storage";
import {
  getNextDogIdSuffix,
  insertDogRecord,
} from "./db";

export function registerIngestRoute(app: Router) {
  app.post("/api/ingest", async (req: Request, res: Response) => {
    // ── Auth ──────────────────────────────────────────────────────────────
    const apiKey = req.headers["x-api-key"];
    const expectedKey = process.env.INGEST_API_KEY;

    if (!expectedKey) {
      return res.status(503).json({ error: "INGEST_API_KEY not configured on server" });
    }
    if (!apiKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized: invalid or missing X-API-Key header" });
    }

    // ── Validate body ─────────────────────────────────────────────────────
    const { image, teamId, gpsLat, gpsLng, areaName, recordedAt, notes, webhookUrl } = req.body || {};

    if (!image) return res.status(400).json({ error: "Missing required field: image" });
    if (!teamId) return res.status(400).json({ error: "Missing required field: teamId" });
    if (gpsLat == null) return res.status(400).json({ error: "Missing required field: gpsLat" });
    if (gpsLng == null) return res.status(400).json({ error: "Missing required field: gpsLng" });
    if (!areaName) return res.status(400).json({ error: "Missing required field: areaName" });
    if (!recordedAt) return res.status(400).json({ error: "Missing required field: recordedAt" });

    const recordedAtDate = new Date(recordedAt);
    if (isNaN(recordedAtDate.getTime())) {
      return res.status(400).json({ error: "Invalid recordedAt: must be a valid ISO 8601 datetime string" });
    }

    // ── Strip data URI prefix if present ─────────────────────────────────
    const base64Clean = image.replace(/^data:image\/\w+;base64,/, "");
    const imgBuffer = Buffer.from(base64Clean, "base64");
    if (imgBuffer.length < 50) {
      return res.status(400).json({ error: "image appears to be empty or invalid base64" });
    }

    try {
      // ── AI Description ────────────────────────────────────────────────
      const openai = createOpenAI({
        apiKey: process.env.BUILT_IN_FORGE_API_KEY,
        baseURL: `${process.env.BUILT_IN_FORGE_API_URL}/v1`,
        fetch: createPatchedFetch(fetch),
      });

      let aiDescription = "";
      try {
        const result = await generateText({
          model: openai.chat("gpt-4o"),
          messages: [
            {
              role: "user",
              content: [
                { type: "image", image: base64Clean },
                {
                  type: "text",
                  text: "Describe this dog in detail for an animal welfare record. Include: approximate breed or breed mix, primary and secondary colors, distinctive markings (patches, spots, scars), approximate size (small/medium/large), body condition (thin/normal/overweight), approximate age (puppy/young/adult/senior), and any notable features (collar, injuries, ear tags). Be concise but thorough. Respond in plain text, no markdown.",
                },
              ],
            },
          ],
        });
        aiDescription = result.text.trim();
      } catch (e) {
        console.error("[ingest] AI description failed:", e);
        // Continue without AI description — don't fail the whole request
      }

      // ── Generate Dog ID ───────────────────────────────────────────────
      const datePrefix = recordedAtDate
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      const suffix = await getNextDogIdSuffix(teamId, datePrefix);
      const dogId = `${datePrefix}-${suffix}`;

      // ── Upload to S3 ──────────────────────────────────────────────────
      const fileKey = `dogs/${teamId}/${dogId}-${nanoid(8)}.jpg`;
      const { url: imageUrl } = await storagePut(fileKey, imgBuffer, "image/jpeg");

      // ── Save to DB ────────────────────────────────────────────────────
      const record = await insertDogRecord({
        teamIdentifier: teamId,
        dogId,
        imageUrl,
        originalImageUrl: null,
        description: aiDescription || null,
        notes: notes ?? null,
        latitude: Number(gpsLat),
        longitude: Number(gpsLng),
        areaName,
        source: "api",
        recordedAt: recordedAtDate,
      });

      // ── Fire webhook ──────────────────────────────────────────────────
      const webhookTarget = webhookUrl || process.env.VITE_DEFAULT_WEBHOOK_URL;
      if (webhookTarget) {
        fetch(webhookTarget, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dogId,
            teamIdentifier: teamId,
            recordedAt: recordedAtDate.toISOString(),
            latitude: Number(gpsLat),
            longitude: Number(gpsLng),
            areaName,
            description: aiDescription,
            notes: notes ?? null,
            imageUrl,
            source: "api",
          }),
        }).catch((e) => console.error("[ingest] Webhook failed:", e));
      }

      // ── Respond ───────────────────────────────────────────────────────
      return res.status(200).json({
        dogId,
        imageUrl,
        aiDescription,
        gpsLat: Number(gpsLat),
        gpsLng: Number(gpsLng),
        areaName,
        recordedAt: recordedAtDate.toISOString(),
        notes: notes ?? null,
        recordId: record.id,
      });
    } catch (e: any) {
      console.error("[ingest] Error:", e);
      return res.status(500).json({ error: "Internal server error", detail: e?.message });
    }
  });
}
