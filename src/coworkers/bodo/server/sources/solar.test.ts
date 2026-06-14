import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchSolar } from "./solar";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("fetchSolar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ok with yieldKwhPerKwp and irradiation from PVGIS fixture", async () => {
    vi.stubGlobal("fetch", respond(200, { outputs: { totals: { fixed: { E_y: 1050, "H(i)_y": 1200 } } } }));
    const dp = await fetchSolar(ctx);
    expect(dp.status).toBe("ok");
    expect(dp.value).toEqual({ yieldKwhPerKwp: 1050, irradiation: 1200 });
  });

  it("returns unavailable when response has no output data", async () => {
    vi.stubGlobal("fetch", respond(200, {}));
    const dp = await fetchSolar(ctx);
    expect(dp.status).toBe("unavailable");
    expect(dp.value).toBeNull();
  });

  it("throws on HTTP 500", async () => {
    vi.stubGlobal("fetch", respond(500, {}));
    await expect(fetchSolar(ctx)).rejects.toThrow("http 500");
  });
});
