import { it, expect } from "vitest";
import { fetchSozio } from "./sozio";

it("returns unavailable with 'in Klärung' reason when district is provided", async () => {
  const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: "Fasangarten", plz: null };
  const dp = await fetchSozio(ctx);
  expect(dp.status).toBe("unavailable");
  expect(dp.reason).toMatch(/in Klärung/);
});

it("returns unavailable with 'kein Stadtteil' reason when district is null", async () => {
  const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };
  const dp = await fetchSozio(ctx);
  expect(dp.status).toBe("unavailable");
  expect(dp.reason).toMatch(/kein Stadtteil/);
});
