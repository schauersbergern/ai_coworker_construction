import { describe, it, expect, vi } from "vitest";
import { buildNarrative, serializeForLlm } from "./narrative";

const dp = (status: string, value: unknown, reason?: string) =>
  ({ status, value, reason, source: "", license: "", confidence: "high", retrievedAt: "" });

describe("narrative", () => {
  it("calls the generator with profile+scores and returns its text", async () => {
    const gen = { generate: vi.fn(async () => "Mikrolage-Text") };
    const text = await buildNarrative(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { profile: { coordinate: { lat: 48, lon: 11 }, fields: {} } as any, scores: { ampel: "gelb" } as any, systemPrompt: "SP" },
      gen,
    );
    expect(text).toBe("Mikrolage-Text");
    expect(gen.generate).toHaveBeenCalledOnce();
  });

  it("serializeForLlm emits ok values but hides unavailable field values (only status/reason)", () => {
    const profile = { coordinate: { lat: 48, lon: 11 }, fields: {
      hochwasser: dp("ok", { hq100: false }),
      sozio: dp("unavailable", null, "nur München"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = serializeForLlm(profile, { ampel: "gruen" } as any);
    const parsed = JSON.parse(json);
    expect(parsed.fields.hochwasser).toEqual({ hq100: false });
    expect(parsed.fields.sozio).toEqual({ status: "unavailable", reason: "nur München" });
  });
});
