import type { LocationProfile, Coordinate } from "./profile";
import { ok, unavailable } from "../sources/types";

export async function buildProfile(
  coord: Coordinate,
  _snapshot: unknown,
  geo: { district: string | null; plz: string | null },
): Promise<LocationProfile> {
  const u = (reason: string) => unavailable<never>({ source: "stub", license: "-", reason });
  const fromGeo = (v: string | null) =>
    v == null
      ? unavailable<string>({ source: "Nominatim (OSM)", license: "ODbL", reason: "nicht ermittelt" })
      : ok(v, { source: "Nominatim (OSM)", license: "ODbL", confidence: "high" });
  return {
    coordinate: coord,
    district: fromGeo(geo.district),
    plz: fromGeo(geo.plz),
    elevation: u("Plan 2"), // echter DGM1-Adapter in Plan 2
    fields: {},
  };
}
