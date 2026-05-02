/**
 * Validates that USE_OPENAI env var is set and ENV.useOpenAI reflects it correctly.
 */
import { describe, it, expect } from "vitest";

describe("USE_OPENAI flag", () => {
  it("USE_OPENAI env var is defined", () => {
    // It should be set (either 'true' or 'false')
    expect(process.env.USE_OPENAI).toBeDefined();
  });

  it("ENV.useOpenAI is a boolean", async () => {
    const { ENV } = await import("./_core/env");
    expect(typeof ENV.useOpenAI).toBe("boolean");
  });

  it("ENV.useOpenAI matches USE_OPENAI env var", async () => {
    const { ENV } = await import("./_core/env");
    const expected = process.env.USE_OPENAI === "true";
    expect(ENV.useOpenAI).toBe(expected);
  });

  it("When USE_OPENAI=false, ENV.useOpenAI is false (Forge mode)", async () => {
    // Default should be false — use Manus Forge API
    const { ENV } = await import("./_core/env");
    if (process.env.USE_OPENAI === "false" || process.env.USE_OPENAI === undefined) {
      expect(ENV.useOpenAI).toBe(false);
    }
  });
});
