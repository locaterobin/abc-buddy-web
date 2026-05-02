/**
 * One-time image migration script
 * Copies all images stored in the old S3/Forge proxy to Google Cloud Storage
 * and updates the database URLs in-place.
 *
 * Tables / columns migrated:
 *   dog_records     → imageUrl, originalImageUrl, releasePhotoUrl, photo2Url
 *   release_plan_dogs → photo2Url
 *
 * Safe to re-run: skips any URL already pointing at storage.googleapis.com
 *
 * Usage:
 *   node scripts/migrate-images-to-gcs.mjs
 *   node scripts/migrate-images-to-gcs.mjs --dry-run   (no DB writes, no uploads)
 */

import mysql from "mysql2/promise";
import { Storage } from "@google-cloud/storage";

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const GCS_BUCKET = process.env.GCS_BUCKET_NAME;
const GCS_JSON = process.env.GCS_SERVICE_ACCOUNT_JSON;
const DB_URL = process.env.DATABASE_URL;

if (!GCS_BUCKET || !GCS_JSON || !DB_URL) {
  console.error("Required env vars: GCS_BUCKET_NAME, GCS_SERVICE_ACCOUNT_JSON, DATABASE_URL");
  process.exit(1);
}

const credentials = JSON.parse(GCS_JSON);
const storage = new Storage({ credentials });
const bucket = storage.bucket(GCS_BUCKET);

// ─── DB connection ────────────────────────────────────────────────────────────

const conn = await mysql.createConnection(DB_URL);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAlreadyGcs(url) {
  return url && url.startsWith("https://storage.googleapis.com");
}

async function downloadUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  return { buffer, contentType };
}

async function uploadToGcs(key, buffer, contentType) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would upload → gs://${GCS_BUCKET}/${key}`);
    return `https://storage.googleapis.com/${GCS_BUCKET}/${key}`;
  }
  const file = bucket.file(key);
  await file.save(buffer, { contentType, resumable: false });
  return `https://storage.googleapis.com/${GCS_BUCKET}/${key}`;
}

function deriveGcsKey(oldUrl, fallbackPrefix, id, suffix) {
  // Try to preserve the original filename from the URL path
  try {
    const pathname = new URL(oldUrl).pathname;
    const filename = pathname.split("/").pop() || `${id}-${suffix}.jpg`;
    return `migrated/${fallbackPrefix}/${filename}`;
  } catch {
    return `migrated/${fallbackPrefix}/${id}-${suffix}.jpg`;
  }
}

// ─── Migration logic ──────────────────────────────────────────────────────────

let migrated = 0;
let skipped = 0;
let failed = 0;

async function migrateUrl(oldUrl, gcsKey) {
  if (!oldUrl || isAlreadyGcs(oldUrl)) {
    skipped++;
    return oldUrl; // already on GCS or null
  }
  try {
    const { buffer, contentType } = await downloadUrl(oldUrl);
    const newUrl = await uploadToGcs(gcsKey, buffer, contentType);
    migrated++;
    return newUrl;
  } catch (err) {
    console.error(`  ✗ Failed: ${oldUrl}\n    ${err.message}`);
    failed++;
    return oldUrl; // keep old URL on failure
  }
}

// ── dog_records ───────────────────────────────────────────────────────────────

console.log("\n=== Migrating dog_records ===");
const [dogRows] = await conn.query(
  "SELECT id, imageUrl, originalImageUrl, releasePhotoUrl, photo2Url FROM dog_records"
);
console.log(`Found ${dogRows.length} rows`);

for (const row of dogRows) {
  const id = row.id;
  console.log(`\ndog_records id=${id}`);

  const newImageUrl = await migrateUrl(
    row.imageUrl,
    deriveGcsKey(row.imageUrl, "dog-records", id, "annotated")
  );
  const newOriginalImageUrl = await migrateUrl(
    row.originalImageUrl,
    deriveGcsKey(row.originalImageUrl, "dog-records", id, "original")
  );
  const newReleasePhotoUrl = await migrateUrl(
    row.releasePhotoUrl,
    deriveGcsKey(row.releasePhotoUrl, "dog-records", id, "release")
  );
  const newPhoto2Url = await migrateUrl(
    row.photo2Url,
    deriveGcsKey(row.photo2Url, "dog-records", id, "photo2")
  );

  if (!DRY_RUN) {
    await conn.query(
      `UPDATE dog_records
         SET imageUrl = ?, originalImageUrl = ?, releasePhotoUrl = ?, photo2Url = ?
       WHERE id = ?`,
      [newImageUrl, newOriginalImageUrl, newReleasePhotoUrl, newPhoto2Url, id]
    );
  }
}

// ── release_plan_dogs ─────────────────────────────────────────────────────────

console.log("\n=== Migrating release_plan_dogs ===");
const [planDogRows] = await conn.query(
  "SELECT id, photo2Url FROM release_plan_dogs WHERE photo2Url IS NOT NULL"
);
console.log(`Found ${planDogRows.length} rows with photo2Url`);

for (const row of planDogRows) {
  const id = row.id;
  console.log(`\nrelease_plan_dogs id=${id}`);

  const newPhoto2Url = await migrateUrl(
    row.photo2Url,
    deriveGcsKey(row.photo2Url, "release-plan-dogs", id, "photo2")
  );

  if (!DRY_RUN) {
    await conn.query(
      "UPDATE release_plan_dogs SET photo2Url = ? WHERE id = ?",
      [newPhoto2Url, id]
    );
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

await conn.end();

console.log("\n=== Migration complete ===");
console.log(`  Migrated : ${migrated}`);
console.log(`  Skipped  : ${skipped} (already on GCS or null)`);
console.log(`  Failed   : ${failed}`);
if (DRY_RUN) console.log("  (DRY RUN — no changes written)");
