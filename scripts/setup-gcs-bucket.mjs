/**
 * One-time setup script: sets CORS and public access on the GCS bucket.
 * Run with: node scripts/setup-gcs-bucket.mjs
 *
 * Uses the Storage JSON API directly for CORS (no setIamPolicy needed for CORS).
 * Uses bucket.makePublic() for public object access.
 */

import { Storage } from "@google-cloud/storage";

const jsonStr = process.env.GCS_SERVICE_ACCOUNT_JSON;
const bucketName = process.env.GCS_BUCKET_NAME;

if (!jsonStr || !bucketName) {
  console.error("GCS_SERVICE_ACCOUNT_JSON and GCS_BUCKET_NAME must be set");
  process.exit(1);
}

const credentials = JSON.parse(jsonStr);
const storage = new Storage({ credentials });
const bucket = storage.bucket(bucketName);

// 1. Set CORS via bucket metadata update (requires storage.buckets.update, not setIamPolicy)
console.log("Setting CORS policy...");
await bucket.setCorsConfiguration([
  {
    maxAgeSeconds: 3600,
    method: ["GET", "HEAD"],
    origin: ["*"],
    responseHeader: ["Content-Type", "Content-Length", "ETag"],
  },
]);
console.log("✓ CORS configured (GET/HEAD from *)");

// 2. Make all objects publicly readable using makePublic()
// This sets the default object ACL to publicRead — no IAM policy change needed
console.log("Setting default object ACL to public-read...");
await bucket.makePublic();
console.log("✓ Default object ACL set to public-read");

console.log("\nBucket setup complete.");
