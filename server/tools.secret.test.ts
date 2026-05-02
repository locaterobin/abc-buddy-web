/**
 * Validates that TOOLS_SECRET env var is set and the /api/tools/backup endpoint
 * correctly rejects requests without the secret and accepts requests with it.
 */
import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000";
const SECRET = process.env.TOOLS_SECRET || "helloworldiamdyingtoseeyou";

describe("TOOLS_SECRET env var", () => {
  it("should be set in the environment", () => {
    expect(process.env.TOOLS_SECRET).toBeDefined();
    expect(process.env.TOOLS_SECRET).not.toBe("");
  });
});

describe("/api/tools/* secret protection", () => {
  it("rejects requests with no secret", async () => {
    const res = await fetch(`${BASE}/api/tools/backup`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);
  });

  it("rejects requests with wrong secret", async () => {
    const res = await fetch(`${BASE}/api/tools/backup?secret=wrongsecret`);
    expect(res.status).toBe(401);
  });

  it("accepts requests with correct secret via query param", async () => {
    const res = await fetch(`${BASE}/api/tools/backup?secret=${encodeURIComponent(SECRET)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.counts).toBeDefined();
  });

  it("accepts requests with correct secret via X-Tools-Secret header", async () => {
    const res = await fetch(`${BASE}/api/tools/backup`, {
      headers: { "X-Tools-Secret": SECRET },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
