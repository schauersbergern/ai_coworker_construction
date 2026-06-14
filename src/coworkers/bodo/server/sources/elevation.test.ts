import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchElevation } from "./elevation";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

describe("fetchElevation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns ok with the elevation value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [{ properties: { GRAY_INDEX: 550 } }] }), { status: 200 })));
    const dp = await fetchElevation(ctx);
    expect(dp.status).toBe("ok");
    expect(dp.value).toBe(550);
  });
  it("returns unavailable when no feature/value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })));
    expect((await fetchElevation(ctx)).status).toBe("unavailable");
  });
  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    await expect(fetchElevation(ctx)).rejects.toThrow();
  });
});
