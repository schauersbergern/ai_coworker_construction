import { describe, expect, it } from "vitest";
import { franzConfigSchema, franzDefaultConfig } from "./config";

describe("franz config", () => {
  it("defaults satisfy the schema", () => {
    expect(franzConfigSchema.safeParse(franzDefaultConfig).success).toBe(true);
  });

  it("default system prompt is the German baudoku instruction", () => {
    expect(franzDefaultConfig.docgen.systemPrompt).toContain("Baudokumentation-Assistent");
  });

  it("rejects empty labels", () => {
    const bad = { ...franzDefaultConfig, labels: { ...franzDefaultConfig.labels, notesHeading: "" } };
    expect(franzConfigSchema.safeParse(bad).success).toBe(false);
  });
});
