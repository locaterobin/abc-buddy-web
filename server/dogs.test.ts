import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock context for public procedures
function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("dogs.generateTeamId", () => {
  it("returns a team ID in adjective-noun format", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dogs.generateTeamId();

    expect(result).toHaveProperty("teamId");
    expect(typeof result.teamId).toBe("string");
    expect(result.teamId).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("generates different IDs on subsequent calls", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = await caller.dogs.generateTeamId();
      ids.add(result.teamId);
    }
    // With 30 adjectives * 30 nouns = 900 combos, 10 calls should produce at least 2 unique
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });
});

describe("dogs.getNextSuffix", () => {
  it("returns a suffix string", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dogs.getNextSuffix({
      teamIdentifier: "test-team-vitest",
      datePrefix: "20260307",
    });

    expect(result).toHaveProperty("suffix");
    expect(typeof result.suffix).toBe("string");
    // First suffix for a new team should be 001
    expect(result.suffix).toBe("001");
  });
});

describe("dogs.checkDogId", () => {
  it("returns false for a non-existent dog ID", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dogs.checkDogId({
      teamIdentifier: "test-team-vitest",
      dogId: "20260307-999",
    });

    expect(result).toHaveProperty("exists");
    expect(result.exists).toBe(false);
  });
});

describe("dogs.geocodeLatLng", () => {
  it("returns an area name for valid coordinates", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dogs.geocodeLatLng({
      latitude: 28.6139,
      longitude: 77.209,
    });

    expect(result).toHaveProperty("areaName");
    expect(typeof result.areaName).toBe("string");
    // Should return some location name for New Delhi coordinates
    expect(result.areaName.length).toBeGreaterThan(0);
  });
});

describe("dogs.getRecords", () => {
  it("returns an array of records for a team", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dogs.getRecords({
      teamIdentifier: "test-team-vitest",
    });

    expect(Array.isArray(result)).toBe(true);
  });
});
