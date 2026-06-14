import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchGeschosse } from "./geschosse";

const ctx = { coord: { lat: 48.0865, lon: 11.5951 }, district: null, plz: null };

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("fetchGeschosse", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns median, max and count from building:levels elements", async () => {
    vi.stubGlobal(
      "fetch",
      respond(200, {
        elements: [
          { tags: { "building:levels": "3" } },
          { tags: { "building:levels": "5" } },
          { tags: { "building:levels": "4" } },
        ],
      }),
    );
    const dp = await fetchGeschosse(ctx);
    expect(dp.status).toBe("ok");
    expect(dp.value).toEqual({ medianLevels: 4, maxLevels: 5, count: 3 });
  });

  it("returns unavailable when no elements have building:levels", async () => {
    vi.stubGlobal("fetch", respond(200, { elements: [] }));
    const dp = await fetchGeschosse(ctx);
    expect(dp.status).toBe("unavailable");
    expect(dp.value).toBeNull();
  });

  it("throws on HTTP 500", async () => {
    vi.stubGlobal("fetch", respond(500, {}));
    await expect(fetchGeschosse(ctx)).rejects.toThrow("http 500");
  });
});
