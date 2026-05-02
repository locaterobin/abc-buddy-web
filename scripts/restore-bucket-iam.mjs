/**
 * Restores full IAM policy on the GCS bucket:
 *   - robin@peepalfarm.org → roles/storage.admin
 *   - service account      → roles/storage.admin
 *   - allUsers             → roles/storage.objectViewer (public read)
 */

import { Storage } from "@google-cloud/storage";

const jsonStr = process.env.GCS_SERVICE_ACCOUNT_JSON;
const bucketName = process.env.GCS_BUCKET_NAME;

if (!jsonStr || !bucketName) {
  console.error("GCS_SERVICE_ACCOUNT_JSON and GCS_BUCKET_NAME must be set");
  process.exit(1);
}

const credentials = JSON.parse(jsonStr);
const serviceAccountEmail = credentials.client_email;
const storage = new Storage({ credentials });
const bucket = storage.bucket(bucketName);

console.log(`Restoring IAM policy on bucket: ${bucketName}`);

await bucket.iam.setPolicy({
  bindings: [
    {
      role: "roles/storage.admin",
      members: [
        "user:robin@peepalfarm.org",
        `serviceAccount:${serviceAccountEmail}`,
      ],
    },
    {
      role: "roles/storage.objectViewer",
      members: ["allUsers"],
    },
  ],
});

console.log("✓ IAM policy restored:");
console.log(`  - robin@peepalfarm.org → roles/storage.admin`);
console.log(`  - ${serviceAccountEmail} → roles/storage.admin`);
console.log(`  - allUsers → roles/storage.objectViewer (public read)`);
