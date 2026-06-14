import { describe, it, expect } from "vitest";
import { resolveRegionProvider } from "./bayern-provider";

describe("region provider", () => {
  it("returns the bayern provider for a Munich coordinate", () => {
    const p = resolveRegionProvider({ lat: 48.0865, lon: 11.5951 });
    expect(p?.id).toBe("bayern");
    expect(p?.sourceIds).toContain("hochwasser");
    expect(p?.sourceIds).toContain("pois");
  });
  it("returns null for a coordinate outside Bayern (Berlin)", () => {
    expect(resolveRegionProvider({ lat: 52.52, lon: 13.405 })).toBeNull();
  });
});
