import { it, expect, vi } from "vitest";
vi.mock("./wms", () => ({ wfsHasFeatureAtPoint: vi.fn(), wmsHasFeatureAtPoint: vi.fn() }));
import { wfsHasFeatureAtPoint, wmsHasFeatureAtPoint } from "./wms";
import { fetchNatur } from "./natur";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

it("flags nsg when only the nsg wfs type has a feature", async () => {
  vi.mocked(wfsHasFeatureAtPoint).mockImplementation(async (_b, typeName) => typeName === "naturschutzgebiet");
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(false);
  const dp = await fetchNatur(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ nsg: true, lsg: false, ffh: false, vogel: false, biotop: false });
});

it("returns all-false when no feature in any layer", async () => {
  vi.mocked(wfsHasFeatureAtPoint).mockResolvedValue(false);
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(false);
  const dp = await fetchNatur(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ nsg: false, lsg: false, ffh: false, vogel: false, biotop: false });
});

it("propagates a WFS error (pipeline handles it)", async () => {
  vi.mocked(wfsHasFeatureAtPoint).mockRejectedValue(new Error("WFS down"));
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(false);
  await expect(fetchNatur(ctx)).rejects.toThrow("WFS down");
});
