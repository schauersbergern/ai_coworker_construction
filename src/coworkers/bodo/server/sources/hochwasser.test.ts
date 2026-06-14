import { it, expect, vi } from "vitest";
vi.mock("./wms", () => ({ wmsHasFeatureAtPoint: vi.fn() }));
import { wmsHasFeatureAtPoint } from "./wms";
import { fetchHochwasser } from "./hochwasser";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

it("flags hq100 when that layer has a feature at the point", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockImplementation(async (_b, layer) => layer === "hwgf_hq100");
  const dp = await fetchHochwasser(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ hqHaeufig: false, hq100: true, hqExtrem: false });
});

it("returns all-false when no layer has a feature", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(false);
  const dp = await fetchHochwasser(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ hqHaeufig: false, hq100: false, hqExtrem: false });
});

it("propagates a WMS error (pipeline handles it)", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockRejectedValue(new Error("WMS down"));
  await expect(fetchHochwasser(ctx)).rejects.toThrow("WMS down");
});
