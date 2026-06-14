import { it, expect, vi } from "vitest";
vi.mock("./wms", () => ({ wmsHasFeatureAtPoint: vi.fn(), wmsFeatureProps: vi.fn() }));
import { wmsHasFeatureAtPoint, wmsFeatureProps } from "./wms";
import { fetchGeologie } from "./geologie";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

it("returns grundwasserHoch:true and baugrundtyp when both layers respond", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(true);
  vi.mocked(wmsFeatureProps).mockResolvedValue({ baugrundtyp: "Kies" });
  const dp = await fetchGeologie(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ grundwasserHoch: true, baugrundtyp: "Kies" });
});

it("returns false and null when grundwasser has no feature and props is null", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockResolvedValue(false);
  vi.mocked(wmsFeatureProps).mockResolvedValue(null);
  const dp = await fetchGeologie(ctx);
  expect(dp.status).toBe("ok");
  expect(dp.value).toEqual({ grundwasserHoch: false, baugrundtyp: null });
});

it("propagates an error when one WMS call rejects", async () => {
  vi.mocked(wmsHasFeatureAtPoint).mockRejectedValue(new Error("WMS fehler"));
  vi.mocked(wmsFeatureProps).mockResolvedValue(null);
  await expect(fetchGeologie(ctx)).rejects.toThrow("WMS fehler");
});
