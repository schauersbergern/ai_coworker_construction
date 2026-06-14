import type { LocationProfile, Coordinate, SourceContext } from "./profile";
import { ok, errored, unavailable, type DataPoint } from "../sources/types";
import { withTimeout } from "../sources/http";
import { resolveRegionProvider } from "../region/bayern-provider";
import type { SourceId } from "../region/region-provider";
import { fetchElevation } from "../sources/elevation";
import { fetchPois } from "../sources/overpass";
import { fetchTransit } from "../sources/transit";
import { fetchHochwasser } from "../sources/hochwasser";
import { fetchNatur } from "../sources/natur";
import { fetchGeologie } from "../sources/geologie";
import { fetchSolar } from "../sources/solar";
import { fetchLuft } from "../sources/luft";
import { fetchGeschosse } from "../sources/geschosse";
import { fetchSozio } from "../sources/sozio";
import { fetchDenkmal } from "../sources/denkmal";

type AdapterMap = Record<SourceId, (ctx: SourceContext) => Promise<DataPoint<unknown>>>;

const DEFAULT_ADAPTERS: AdapterMap = {
  elevation: fetchElevation,
  pois: fetchPois,
  transit: fetchTransit,
  hochwasser: fetchHochwasser,
  natur: fetchNatur,
  geologie: fetchGeologie,
  solar: fetchSolar,
  luft: fetchLuft,
  geschosse: fetchGeschosse,
  sozio: fetchSozio,
  denkmal: fetchDenkmal,
} as AdapterMap;

const TIMEOUT_MS = 12000;

async function runSource(
  id: SourceId,
  ctx: SourceContext,
  fn: (ctx: SourceContext) => Promise<DataPoint<unknown>>,
): Promise<DataPoint<unknown>> {
  try {
    return await withTimeout(fn(ctx), TIMEOUT_MS, id);
  } catch (e) {
    return errored({ source: id, license: "-", reason: e instanceof Error ? e.message : "Fehler" });
  }
}

export async function buildProfile(
  coord: Coordinate,
  rawSnapshot: unknown,
  geo: { district: string | null; plz: string | null },
  opts?: { sourceIds?: SourceId[]; adapters?: AdapterMap },
): Promise<LocationProfile> {
  // rawSnapshot kommt aus der DB (Prisma Json) — wir casten defensiv.
  const snapshot = (rawSnapshot ?? {}) as { sources?: Partial<Record<SourceId, boolean>> };
  // resolveRegionProvider liefert null außerhalb Bayerns (Job bricht das schon vorher ab;
  // hier defensiv: keine Quellen → leeres fields).
  const provider = resolveRegionProvider(coord);
  const sourceIds = opts?.sourceIds ?? provider?.sourceIds ?? [];
  const adapters = opts?.adapters ?? DEFAULT_ADAPTERS;
  const enabled = (id: SourceId) => snapshot.sources?.[id] !== false;
  const ctx: SourceContext = { coord, district: geo.district, plz: geo.plz };

  const entries = await Promise.all(
    sourceIds.map(async (id): Promise<[SourceId, DataPoint<unknown>]> => {
      if (!enabled(id)) {
        return [id, unavailable({ source: id, license: "-", reason: "per Konfiguration deaktiviert" })];
      }
      return [id, await runSource(id, ctx, adapters[id])];
    }),
  );

  const fields = Object.fromEntries(entries) as Record<string, DataPoint<unknown>>;

  const fromGeo = (v: string | null) =>
    v == null
      ? unavailable<string>({ source: "Nominatim (OSM)", license: "ODbL", reason: "nicht ermittelt" })
      : ok(v, { source: "Nominatim (OSM)", license: "ODbL", confidence: "high" });

  return {
    coordinate: coord,
    district: fromGeo(geo.district),
    plz: fromGeo(geo.plz),
    elevation: (fields.elevation as DataPoint<number>) ??
      unavailable<number>({ source: "LDBV DGM1", license: "CC BY 4.0", reason: "n/a" }),
    fields,
  };
}
