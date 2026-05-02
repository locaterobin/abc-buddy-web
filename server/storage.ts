/**
 * Storage helpers — backed by Google Cloud Storage.
 *
 * Credentials are injected via:
 *   GCS_SERVICE_ACCOUNT_JSON  — full service-account JSON (stringified)
 *   GCS_BUCKET_NAME           — e.g. "photos.abc.peepalfarm.org"
 *
 * Uploaded objects are made publicly readable (allUsers: Storage Object Viewer
 * must be set on the bucket). The returned URL is the canonical public URL:
 *   https://storage.googleapis.com/<bucket>/<key>
 */

import { Storage } from "@google-cloud/storage";

function getGcsClient(): { storage: Storage; bucket: string } {
  const jsonStr = process.env.GCS_SERVICE_ACCOUNT_JSON;
  const bucket = process.env.GCS_BUCKET_NAME;

  if (!jsonStr) throw new Error("GCS_SERVICE_ACCOUNT_JSON is not set");
  if (!bucket) throw new Error("GCS_BUCKET_NAME is not set");

  const credentials = JSON.parse(jsonStr);
  const storage = new Storage({ credentials });
  return { storage, bucket };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

/**
 * Upload bytes to GCS and return the public URL.
 * The object is saved with public-read ACL so it is accessible without signing.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const { storage, bucket } = getGcsClient();
  const key = normalizeKey(relKey);

  const file = storage.bucket(bucket).file(key);
  const buffer =
    typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await file.save(buffer, {
    contentType,
    // No per-object ACL needed — bucket uses uniform access with allUsers:objectViewer IAM
    resumable: false,
  });

  const url = `https://storage.googleapis.com/${bucket}/${key}`;
  return { key, url };
}

/**
 * Return the public URL for an existing GCS object.
 * Since objects are uploaded with publicRead, no signing is needed.
 */
export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const { bucket } = getGcsClient();
  const key = normalizeKey(relKey);
  const url = `https://storage.googleapis.com/${bucket}/${key}`;
  return { key, url };
}
