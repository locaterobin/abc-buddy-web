import { describe, it, expect } from "vitest";
import { storagePut, storageGet } from "./storage";

describe("GCS Storage integration", () => {
  it("GCS_SERVICE_ACCOUNT_JSON and GCS_BUCKET_NAME are set", () => {
    expect(process.env.GCS_SERVICE_ACCOUNT_JSON).toBeTruthy();
    expect(process.env.GCS_BUCKET_NAME).toBeTruthy();
    // Ensure it parses as valid JSON
    const parsed = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_JSON!);
    expect(parsed.type).toBe("service_account");
    expect(parsed.client_email).toBeTruthy();
  });

  it("can upload a test file to GCS and get a public URL", async () => {
    const testKey = `test/vitest-probe-${Date.now()}.txt`;
    const { key, url } = await storagePut(
      testKey,
      Buffer.from("abc-buddy gcs test"),
      "text/plain"
    );
    expect(key).toBe(testKey);
    expect(url).toContain("storage.googleapis.com");
    expect(url).toContain(process.env.GCS_BUCKET_NAME!);

    // Verify the file is publicly accessible
    const resp = await fetch(url);
    expect(resp.status).toBe(200);
    const text = await resp.text();
    expect(text).toBe("abc-buddy gcs test");

    // storageGet returns same URL
    const got = await storageGet(testKey);
    expect(got.url).toBe(url);
  }, 30000);
});
