import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocode } from "./nominatim";

// Fake timers halten den 1s-Throttle deterministisch (kein realer Wall-Clock-Delay).
describe("nominatim geocode", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function run<T>(p: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync(); // flusht ggf. den Throttle-setTimeout
    return p;
  }

  it("maps a nominatim hit to GeocodeResult (incl. state)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { lat: "48.0865", lon: "11.5951", address: { suburb: "Fasangarten", postcode: "81549", state: "Bayern" } },
    ]), { status: 200 })));
    const g = await run(geocode("Kiefernstr. 25, München"));
    expect(g).toEqual({ lat: 48.0865, lon: 11.5951, district: "Fasangarten", plz: "81549", state: "Bayern" });
  });

  it("falls back to city_district when suburb is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { lat: "49.4521", lon: "11.0767", address: { city_district: "Altstadt", postcode: "90403", state: "Bayern" } },
    ]), { status: 200 })));
    const g = await run(geocode("Hauptmarkt, Nürnberg"));
    expect(g?.district).toBe("Altstadt");
  });

  it("returns null when no hit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await run(geocode("nirgendwo"))).toBeNull();
  });
});
