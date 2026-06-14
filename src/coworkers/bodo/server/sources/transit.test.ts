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
  it("is unavailable when no stop is within 1500m", async () => {
    const dp = await fetchTransit(ctx(48.0865, 11.5951), [{ name: "Weit weg", lat: 49, lon: 12 }]);
    expect(dp.status).toBe("unavailable");
  });
  it("is unavailable for an empty stops dataset", async () => {
    const dp = await fetchTransit(ctx(48.0865, 11.5951), []);
    expect(dp.status).toBe("unavailable");
  });
});
