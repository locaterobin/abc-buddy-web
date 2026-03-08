import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { registerIngestRoute } from "./ingest";

// Build a minimal express app for testing
function buildTestApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  registerIngestRoute(app as any);
  return app;
}

// A tiny valid PNG (10x10 solid color)
function makePng(): string {
  const { Buffer } = require("buffer");
  // Pre-computed base64 of a minimal valid PNG
  return "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAADklEQVR42mNk+M9QDwADhQGAWjR9awAAAABJRU5ErkJggg==";
}

describe("POST /api/ingest", () => {
  let app: express.Express;

  beforeAll(() => {
    process.env.INGEST_API_KEY = process.env.INGEST_API_KEY || "test-key-123";
    app = buildTestApp();
  });

  it("returns 401 when X-API-Key is missing", async () => {
    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/ingest")
      .send({ image: makePng(), teamId: "t", gpsLat: 1, gpsLng: 1, areaName: "A", recordedAt: "2025-01-01T00:00:00Z" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  it("returns 401 when X-API-Key is wrong", async () => {
    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/ingest")
      .set("X-API-Key", "wrong-key")
      .send({ image: makePng(), teamId: "t", gpsLat: 1, gpsLng: 1, areaName: "A", recordedAt: "2025-01-01T00:00:00Z" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const { default: supertest } = await import("supertest");
    const key = process.env.INGEST_API_KEY!;
    const res = await supertest(app)
      .post("/api/ingest")
      .set("X-API-Key", key)
      .send({ image: makePng() }); // missing teamId, gpsLat, etc.
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required field/i);
  });

  it("returns 400 for invalid recordedAt", async () => {
    const { default: supertest } = await import("supertest");
    const key = process.env.INGEST_API_KEY!;
    const res = await supertest(app)
      .post("/api/ingest")
      .set("X-API-Key", key)
      .send({ image: makePng(), teamId: "t", gpsLat: 1, gpsLng: 1, areaName: "A", recordedAt: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid recordedAt/i);
  });
});
