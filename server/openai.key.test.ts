import { describe, it, expect } from "vitest";

describe("OpenAI API key validation", () => {
  it("OPENAI_API_KEY is set in environment", () => {
    expect(process.env.OPENAI_API_KEY).toBeTruthy();
    expect(process.env.OPENAI_API_KEY!.startsWith("sk-")).toBe(true);
  });

  it("can call OpenAI API with the provided key", async () => {
    const key = process.env.OPENAI_API_KEY!;
    const resp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(resp.status).toBe(200);
    const data = await resp.json() as { object: string };
    expect(data.object).toBe("list");
  }, 15000);
});
