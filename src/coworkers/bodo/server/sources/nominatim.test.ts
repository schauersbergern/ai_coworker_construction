import { describe, it, expect, vi, afterEach } from "vitest";
import { geocode } from "./nominatim";

describe("nominatim geocode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps a nominatim hit to GeocodeResult (incl. state)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { lat: "48.0865", lon: "11.5951", address: { suburb: "Fasangarten", postcode: "81549", state: "Bayern" } },
    ]), { status: 200 })));
    const g = await geocode("Kiefernstr. 25, München");
    expect(g).toEqual({ lat: 48.0865, lon: 11.5951, district: "Fasangarten", plz: "81549", state: "Bayern" });
  });

  it("returns null when no hit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await geocode("nirgendwo")).toBeNull();
  });
});
