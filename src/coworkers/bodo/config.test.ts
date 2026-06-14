import { describe, it, expect } from "vitest";
import { bodoConfigSchema, bodoDefaultConfig } from "./config";

describe("bodo config", () => {
  it("default config satisfies schema", () => {
    expect(() => bodoConfigSchema.parse(bodoDefaultConfig)).not.toThrow();
  });
  it("has a non-empty narrative system prompt", () => {
    expect(bodoDefaultConfig.narrative.systemPrompt.length).toBeGreaterThan(0);
  });
  it("enables all known sources by default", () => {
    expect(bodoDefaultConfig.sources.hochwasser).toBe(true);
    expect(bodoDefaultConfig.sources.pois).toBe(true);
  });
  it("rejects negative scoring weights", () => {
    const bad = {
      ...bodoDefaultConfig,
      scoring: { weights: { ...bodoDefaultConfig.scoring.weights, oepnv: -1 } },
    };
    expect(() => bodoConfigSchema.parse(bad)).toThrow();
  });
});
