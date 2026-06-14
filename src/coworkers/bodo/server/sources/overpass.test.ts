import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPois } from "./overpass";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

describe("fetchPois", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("counts POIs and finds nearest distance per category", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ elements: [
      { lat: 48.0866, lon: 11.5952, tags: { amenity: "pharmacy" } },
    ] }), { status: 200 })));
    const dp = await fetchPois(ctx);
    expect(dp.status).toBe("ok");
    expect(dp.value!.pharmacy.count).toBe(1);
    expect(dp.value!.pharmacy.nearestM).toBeLessThan(50);
  });
});
