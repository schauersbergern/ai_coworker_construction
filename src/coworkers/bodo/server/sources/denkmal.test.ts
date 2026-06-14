import { it, expect, vi, afterEach } from "vitest";
vi.mock("./wms", () => ({ wmsHasFeatureAtPoint: vi.fn() }));
import { wmsHasFeatureAtPoint } from "./wms";
import { fetchDenkmal } from "./denkmal";

afterEach(() => vi.clearAllMocks());

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

it("flags einzeldenkmal when only that layer has a feature", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockImplementation(async (_b, layer) => layer === "einzeldenkmalO");
  const dp = await fetchDenkmal(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ einzeldenkmal: true, ensemble: false, bodendenkmal: false });
});

it("returns all-false when no layer has a feature", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(false);
  const dp = await fetchDenkmal(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ einzeldenkmal: false, ensemble: false, bodendenkmal: false });
});

it("propagates a WMS error (pipeline handles it)", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockRejectedValue(new Error("WMS down"));
  await expect(fetchDenkmal(ctx)).rejects.toThrow("WMS down");
});
