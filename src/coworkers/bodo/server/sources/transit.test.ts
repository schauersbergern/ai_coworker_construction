import { describe, it, expect } from "vitest";
import { fetchTransit } from "./transit";

const ctx = (lat: number, lon: number) => ({ coord: { lat, lon }, district: null, plz: null });

describe("fetchTransit", () => {
  it("finds the nearest stop within radius", async () => {
    const dp = await fetchTransit(ctx(48.0865, 11.5951), [
      { name: "Kiefernstraße", lat: 48.0870, lon: 11.5955 },
      { name: "Weit weg", lat: 49, lon: 12 },
    ]);
    expect(dp.status).toBe("ok");
    expect(dp.value!.nearest.name).toBe("Kiefernstraße");
    expect(dp.value!.nearest.distanceM).toBeLessThan(500);
  });
  it("is unavailable ('keine Haltestelle in 1500 m') when the nearest stop is in coverage but >1500m", async () => {
    // ~3 km entfernt: innerhalb der Abdeckung (<25 km), aber außerhalb des Relevanzradius.
    const dp = await fetchTransit(ctx(48.0865, 11.5951), [{ name: "Etwas weiter", lat: 48.114, lon: 11.5951 }]);
    expect(dp.status).toBe("unavailable");
    expect(dp.reason).toMatch(/1500/);
  });
  it("is unavailable ('außerhalb der Abdeckung') when the nearest stop is far beyond the MVV/MVG area", async () => {
    const dp = await fetchTransit(ctx(48.0865, 11.5951), [{ name: "Weit weg", lat: 49, lon: 12 }]);
    expect(dp.status).toBe("unavailable");
    expect(dp.reason).toMatch(/abdeckung/i);
  });
  it("is unavailable (outside coverage) for an empty stops dataset", async () => {
    const dp = await fetchTransit(ctx(48.0865, 11.5951), []);
    expect(dp.status).toBe("unavailable");
    expect(dp.reason).toMatch(/abdeckung/i);
  });
});
