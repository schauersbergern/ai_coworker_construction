import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLuft } from "./luft";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("fetchLuft", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns ok with last non-null pm25 and aqi values", async () => {
    vi.stubGlobal("fetch", respond(200, { hourly: { pm2_5: [5, 7], european_aqi: [20, 22] } }));
    const dp = await fetchLuft(ctx);
    expect(dp.status).toBe("ok");
    expect(dp.value).toEqual({ pm25: 7, aqi: 22 });
  });

  it("returns unavailable when pm2_5 array is empty", async () => {
    vi.stubGlobal("fetch", respond(200, { hourly: { pm2_5: [] } }));
    const dp = await fetchLuft(ctx);
    expect(dp.status).toBe("unavailable");
    expect(dp.value).toBeNull();
  });

  it("throws on HTTP 500", async () => {
    vi.stubGlobal("fetch", respond(500, {}));
    await expect(fetchLuft(ctx)).rejects.toThrow("http 500");
  });
});
