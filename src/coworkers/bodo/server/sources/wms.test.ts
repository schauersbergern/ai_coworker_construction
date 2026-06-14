import { describe, it, expect, vi } from "vitest";
import { wmsHasFeatureAtPoint, wfsHasFeatureAtPoint } from "./wms";

describe("wms/wfs helpers", () => {
  it("wmsHasFeatureAtPoint: true when features present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [{ properties: {} }] }), { status: 200 })));
    expect(await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 })).toBe(true);
  });
  it("wmsHasFeatureAtPoint: false when no features", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })));
    expect(await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 })).toBe(false);
  });
  it("wfsHasFeatureAtPoint: true when features present", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [{ id: 1 }] }), { status: 200 })));
    expect(await wfsHasFeatureAtPoint("https://wfs", "ns:typeA", { lat: 48, lon: 11 })).toBe(true);
  });
});
