import { describe, it, expect } from "vitest";

describe("env defaults", () => {
  it("VITE_DEFAULT_TEAM_ID is set", () => {
    expect(process.env.VITE_DEFAULT_TEAM_ID).toBeTruthy();
  });

  it("VITE_DEFAULT_WEBHOOK_URL is set and points to n8n", () => {
    expect(process.env.VITE_DEFAULT_WEBHOOK_URL).toBe(
      "https://n8n.peepalfarm.org/webhook/abcbuddy"
    );
  });
});
