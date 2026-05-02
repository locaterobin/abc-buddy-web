/**
 * Admin tool endpoints — all protected by a shared secret.
 *
 * Pass the secret as a query param or header:
 *   ?secret=helloworldiamdyingtoseeyou
 *   X-Tools-Secret: helloworldiamdyingtoseeyou
 *
 * Endpoints:
 *   GET  /api/tools/backup          — export DB tables to GCS, returns GCS URL
 *   GET  /api/tools/migrate-images  — migrate old S3/Forge images to GCS, updates DB
 *                                     add ?dryRun=true to preview without writing
 *   GET  /api/tools/export-json     — download all records as JSON (same filters as Records tab)
 *                                     optional query params: catchFrom, catchTo, releaseFrom,
 *                                     releaseTo, status (active|released)
 */

import type { Express, Request, Response } from "express";
import { Storage } from "@google-cloud/storage";
import mysql from "mysql2/promise";
import { getRecordsFiltered } from "./db";

// ─── Shared secret ────────────────────────────────────────────────────────────

const TOOLS_SECRET = process.env.TOOLS_SECRET || "helloworldiamdyingtoseeyou";

function checkSecret(req: Request, res: Response): boolean {
  const provided =
    (req.query.secret as string | undefined) ||
    (req.headers["x-tools-secret"] as string | undefined);
  if (provided !== TOOLS_SECRET) {
    res.status(401).json({ error: "Unauthorized: invalid or missing secret" });
    return false;
  }
  return true;
}

// ─── GCS helpers ─────────────────────────────────────────────────────────────

function getGcsClient() {
  const json = process.env.GCS_SERVICE_ACCOUNT_JSON;
  const bucket = process.env.GCS_BUCKET_NAME;
  if (!json || !bucket) throw new Error("GCS env vars not set");
  const credentials = JSON.parse(json);
  const storage = new Storage({ credentials });
  return { bucket: storage.bucket(bucket), bucketName: bucket };
}

function getDbUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  return url;
}

// ─── /api/tools/backup ───────────────────────────────────────────────────────

async function handleBackup(_req: Request, res: Response) {
  const conn = await mysql.createConnection(getDbUrl());
  try {
    const [dogRecords] = await conn.query("SELECT * FROM dog_records");
    const [releasePlans] = await conn.query("SELECT * FROM release_plans");
    const [releasePlanDogs] = await conn.query("SELECT * FROM release_plan_dogs");

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp =
      `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
      `_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}`;

    const payload = {
      exportedAt: now.toISOString(),
      tables: { dog_records: dogRecords, release_plans: releasePlans, release_plan_dogs: releasePlanDogs },
      counts: {
        dog_records: (dogRecords as unknown[]).length,
        release_plans: (releasePlans as unknown[]).length,
        release_plan_dogs: (releasePlanDogs as unknown[]).length,
      },
    };

    const json = JSON.stringify(payload, null, 2);
    const gcsKey = `backups/${timestamp}.json`;
    const { bucket, bucketName } = getGcsClient();
    await bucket.file(gcsKey).save(Buffer.from(json, "utf8"), {
      contentType: "application/json",
      resumable: false,
    });

    const url = `https://storage.googleapis.com/${bucketName}/${gcsKey}`;
    res.json({ ok: true, url, gcsKey, counts: payload.counts, sizeKb: +(json.length / 1024).toFixed(1) });
  } finally {
    await conn.end();
  }
}

// ─── /api/tools/migrate-images ───────────────────────────────────────────────

async function handleMigrateImages(req: Request, res: Response) {
  const dryRun = req.query.dryRun === "true" || req.query.dryRun === "1";
  const { bucket, bucketName } = getGcsClient();
  const conn = await mysql.createConnection(getDbUrl());

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  function isAlreadyGcs(url: string | null | undefined) {
    return !url || url.startsWith("https://storage.googleapis.com");
  }

  async function migrateUrl(oldUrl: string | null | undefined, gcsKey: string): Promise<string | null> {
    if (isAlreadyGcs(oldUrl)) { skipped++; return oldUrl ?? null; }
    try {
      const resp = await fetch(oldUrl!);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      if (!dryRun) {
        await bucket.file(gcsKey).save(buffer, { contentType, resumable: false });
      }
      migrated++;
      return `https://storage.googleapis.com/${bucketName}/${gcsKey}`;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${oldUrl} → ${msg}`);
      failed++;
      return oldUrl ?? null;
    }
  }

  function deriveKey(url: string | null | undefined, prefix: string, id: number | string, suffix: string) {
    try {
      const filename = new URL(url!).pathname.split("/").pop() || `${id}-${suffix}.jpg`;
      return `migrated/${prefix}/${filename}`;
    } catch {
      return `migrated/${prefix}/${id}-${suffix}.jpg`;
    }
  }

  try {
    // dog_records
    const [dogRows] = await conn.query(
      "SELECT id, imageUrl, originalImageUrl, releasePhotoUrl, photo2Url FROM dog_records"
    ) as [Array<{ id: number; imageUrl: string | null; originalImageUrl: string | null; releasePhotoUrl: string | null; photo2Url: string | null }>, unknown];

    for (const row of dogRows) {
      const id = row.id;
      const newImageUrl = await migrateUrl(row.imageUrl, deriveKey(row.imageUrl, "dog-records", id, "annotated"));
      const newOriginalImageUrl = await migrateUrl(row.originalImageUrl, deriveKey(row.originalImageUrl, "dog-records", id, "original"));
      const newReleasePhotoUrl = await migrateUrl(row.releasePhotoUrl, deriveKey(row.releasePhotoUrl, "dog-records", id, "release"));
      const newPhoto2Url = await migrateUrl(row.photo2Url, deriveKey(row.photo2Url, "dog-records", id, "photo2"));
      if (!dryRun) {
        await conn.query(
          "UPDATE dog_records SET imageUrl=?, originalImageUrl=?, releasePhotoUrl=?, photo2Url=? WHERE id=?",
          [newImageUrl, newOriginalImageUrl, newReleasePhotoUrl, newPhoto2Url, id]
        );
      }
    }

    // release_plan_dogs
    const [planRows] = await conn.query(
      "SELECT id, photo2Url FROM release_plan_dogs WHERE photo2Url IS NOT NULL"
    ) as [Array<{ id: number; photo2Url: string | null }>, unknown];

    for (const row of planRows) {
      const newPhoto2Url = await migrateUrl(row.photo2Url, deriveKey(row.photo2Url, "release-plan-dogs", row.id, "photo2"));
      if (!dryRun) {
        await conn.query("UPDATE release_plan_dogs SET photo2Url=? WHERE id=?", [newPhoto2Url, row.id]);
      }
    }

    res.json({ ok: true, dryRun, migrated, skipped, failed, errors: errors.slice(0, 20) });
  } finally {
    await conn.end();
  }
}

// ─── /api/tools/export-json ──────────────────────────────────────────────────

async function handleExportJson(req: Request, res: Response) {
  const { catchFrom, catchTo, releaseFrom, releaseTo, status, teamId } = req.query as Record<string, string | undefined>;

  const records = await getRecordsFiltered(
    teamId ?? "",
    {
      dateFrom: catchFrom ?? undefined,
      dateTo: catchTo ?? undefined,
      releasedDateFrom: releaseFrom ?? undefined,
      releasedDateTo: releaseTo ?? undefined,
      status: (status as "active" | "released" | "all" | undefined) ?? "all",
    }
  );

  const json = JSON.stringify(records, null, 2);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="abc-records-${Date.now()}.json"`);
  res.send(json);
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerToolsRoute(app: Express) {
  const wrap = (handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      if (!checkSecret(req, res)) return;
      try {
        await handler(req, res);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[tools]", msg);
        res.status(500).json({ error: msg });
      }
    };

  app.get("/api/tools/backup", wrap(handleBackup));
  app.get("/api/tools/migrate-images", wrap(handleMigrateImages));
  app.get("/api/tools/export-json", wrap(handleExportJson));
}
