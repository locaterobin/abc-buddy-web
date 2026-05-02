/**
 * Database backup script
 * Exports dog_records, release_plans, and release_plan_dogs to a single JSON
 * file and uploads it to Google Cloud Storage under backups/YYYY-MM-DD.json
 *
 * Usage:
 *   node scripts/backup-db-to-gcs.mjs
 *
 * The backup file is stored at:
 *   gs://<GCS_BUCKET_NAME>/backups/YYYY-MM-DD_HH-MM-SS.json
 *
 * To restore: download the JSON from GCS and re-insert rows as needed.
 */

import mysql from "mysql2/promise";
import { Storage } from "@google-cloud/storage";

// ─── Config ──────────────────────────────────────────────────────────────────

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

// ─── Export tables ────────────────────────────────────────────────────────────

console.log("Fetching dog_records...");
const [dogRecords] = await conn.query("SELECT * FROM dog_records");
console.log(`  ${dogRecords.length} rows`);

console.log("Fetching release_plans...");
const [releasePlans] = await conn.query("SELECT * FROM release_plans");
console.log(`  ${releasePlans.length} rows`);

console.log("Fetching release_plan_dogs...");
const [releasePlanDogs] = await conn.query("SELECT * FROM release_plan_dogs");
console.log(`  ${releasePlanDogs.length} rows`);

await conn.end();

// ─── Build backup payload ─────────────────────────────────────────────────────

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const timestamp =
  `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
  `_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}`;

const payload = {
  exportedAt: now.toISOString(),
  tables: {
    dog_records: dogRecords,
    release_plans: releasePlans,
    release_plan_dogs: releasePlanDogs,
  },
  counts: {
    dog_records: dogRecords.length,
    release_plans: releasePlans.length,
    release_plan_dogs: releasePlanDogs.length,
  },
};

const json = JSON.stringify(payload, null, 2);
const gcsKey = `backups/${timestamp}.json`;

// ─── Upload to GCS ────────────────────────────────────────────────────────────

console.log(`\nUploading backup to gs://${GCS_BUCKET}/${gcsKey} ...`);
const file = bucket.file(gcsKey);
await file.save(Buffer.from(json, "utf8"), {
  contentType: "application/json",
  resumable: false,
});

const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsKey}`;
console.log(`✓ Backup uploaded: ${publicUrl}`);
console.log(`\nSummary:`);
console.log(`  dog_records      : ${dogRecords.length} rows`);
console.log(`  release_plans    : ${releasePlans.length} rows`);
console.log(`  release_plan_dogs: ${releasePlanDogs.length} rows`);
console.log(`  File size        : ${(json.length / 1024).toFixed(1)} KB`);
console.log(`  GCS path         : ${gcsKey}`);
