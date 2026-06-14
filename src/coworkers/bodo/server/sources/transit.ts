import { ok, unavailable, type DataPoint } from "./types";
import type { Coordinate, SourceContext } from "../pipeline/profile";
import rawStops from "./data/mvv-stops.json";

export interface Stop {
  name: string;
  lat: number;
  lon: number;
}

export interface TransitInfo {
  nearest: { name: string; distanceM: number };
}

const DEFAULT_STOPS = rawStops as Stop[];
const MAX_RADIUS_M = 1500;
// Der GTFS-Datensatz deckt nur den MVV/MVG-Raum (Großraum München) ab. Liegt die NÄCHSTE
// bekannte Haltestelle weiter als das weg, ist der Punkt außerhalb der Datenabdeckung — dann
// ehrlich "nur München abgedeckt" melden statt fälschlich "keine Haltestelle" (was ÖPNV-Mangel
// suggerierte). Bayern-weite Abdeckung erfordert weitere GTFS-Feeds (DB/regionale Verbünde).
const COVERAGE_MAX_M = 25000;

function haversineM(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function fetchTransit(
  ctx: SourceContext,
  stops: Stop[] = DEFAULT_STOPS,
): Promise<DataPoint<TransitInfo>> {
  const c = ctx.coord;
  let best: { name: string; distanceM: number } | null = null;

  for (const s of stops) {
    const d = Math.round(haversineM(c, { lat: s.lat, lon: s.lon }));
    if (!best || d < best.distanceM) best = { name: s.name, distanceM: d };
  }

  if (!best || best.distanceM > COVERAGE_MAX_M) {
    // Außerhalb der MVV/MVG-Datenabdeckung — keine Aussage möglich (kein ÖPNV-Mangel).
    return unavailable<TransitInfo>({
      source: "MVV/MVG GTFS",
      license: "CC BY 4.0",
      reason: "außerhalb der ÖPNV-Datenabdeckung (nur MVV/MVG-Raum München)",
    });
  }
  if (best.distanceM > MAX_RADIUS_M) {
    // Innerhalb der Abdeckung, aber keine Haltestelle im Relevanzradius.
    return unavailable<TransitInfo>({
      source: "MVV/MVG GTFS",
      license: "CC BY 4.0",
      reason: "keine Haltestelle in 1500 m",
    });
  }

  return ok({ nearest: best }, { source: "MVV/MVG GTFS", license: "CC BY 4.0", confidence: "high" });
}
