import { describe, it, expect, vi, afterEach } from "vitest";
import { wmsHasFeatureAtPoint, wmsFeatureProps, wfsHasFeatureAtPoint } from "./wms";

const respond = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("wms/wfs helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("wmsHasFeatureAtPoint: true when features present", async () => {
    vi.stubGlobal("fetch", respond({ features: [{ properties: {} }] }));
    expect(await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 })).toBe(true);
  });
  it("wmsHasFeatureAtPoint: false when no features", async () => {
    vi.stubGlobal("fetch", respond({ features: [] }));
    expect(await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 })).toBe(false);
  });
  it("wmsFeatureProps: returns first feature's properties", async () => {
    vi.stubGlobal("fetch", respond({ features: [{ properties: { baugrundtyp: "Kies" } }] }));
    expect(await wmsFeatureProps("https://wms", "layerA", { lat: 48, lon: 11 })).toEqual({ baugrundtyp: "Kies" });
  });
  it("wmsFeatureProps: returns null when no features", async () => {
    vi.stubGlobal("fetch", respond({ features: [] }));
    expect(await wmsFeatureProps("https://wms", "layerA", { lat: 48, lon: 11 })).toBeNull();
  });
  it("wfsHasFeatureAtPoint: true when features present", async () => {
    vi.stubGlobal("fetch", respond({ features: [{ id: 1 }] }));
    expect(await wfsHasFeatureAtPoint("https://wfs", "ns:typeA", { lat: 48, lon: 11 })).toBe(true);
  });
  it("wfsHasFeatureAtPoint: false when no features", async () => {
    vi.stubGlobal("fetch", respond({ features: [] }));
    expect(await wfsHasFeatureAtPoint("https://wfs", "ns:typeA", { lat: 48, lon: 11 })).toBe(false);
  });

  it("wmsHasFeatureAtPoint sends the OGC-mandatory STYLES and FORMAT params", async () => {
    const fetchSpy = respond({ features: [] });
    vi.stubGlobal("fetch", fetchSpy);
    await wmsHasFeatureAtPoint("https://wms", "layerA", { lat: 48, lon: 11 });
    const url = String((fetchSpy.mock.calls as unknown as string[][])[0]?.[0] ?? "");
    expect(url).toContain("STYLES=");
    expect(url).toContain("FORMAT=image/png");
  });
});
