import { describe, it, expect, vi } from "vitest";
import { buildProfile } from "./build-profile";

describe("buildProfile", () => {
  it("a failing source becomes an error field; others stay ok", async () => {
    const adapters = {
      elevation: vi.fn(async () => ({ value: 550, status: "ok" })),
      pois: vi.fn(async () => { throw new Error("overpass down"); }),
      hochwasser: vi.fn(async () => ({ value: { hq100: false }, status: "ok" })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceIds = ["elevation", "pois", "hochwasser"] as any;
    const geo = { district: "Fasangarten", plz: "81549" };
    const profile = await buildProfile(
      { lat: 48.0865, lon: 11.5951 },
      { sources: { elevation: true, pois: true, hochwasser: true } },
      geo,
      { sourceIds, adapters },
    );
    expect(profile.district.status).toBe("ok");
    expect(profile.fields.elevation.status).toBe("ok");
    expect(profile.fields.pois.status).toBe("error");
    expect(profile.fields.hochwasser.status).toBe("ok");
  });

  it("a disabled source is unavailable and its adapter is not called", async () => {
    const pois = vi.fn(async () => ({ value: {}, status: "ok" }));
    const profile = await buildProfile(
      { lat: 48.0865, lon: 11.5951 },
      { sources: { pois: false } },
      { district: null, plz: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { sourceIds: ["pois"] as any, adapters: { pois } as any },
    );
    expect(profile.fields.pois.status).toBe("unavailable");
    expect(pois).not.toHaveBeenCalled();
  });

  it("no region provider (outside Bayern) yields empty fields", async () => {
    const profile = await buildProfile(
      { lat: 52.52, lon: 13.405 },
      { sources: {} },
      { district: null, plz: null },
    );
    expect(Object.keys(profile.fields)).toHaveLength(0);
  });
});
