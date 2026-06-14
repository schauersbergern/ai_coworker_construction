import type { Coordinate } from "../pipeline/profile";
import type { RegionProvider, SourceId } from "./region-provider";

const BAYERN_SOURCES: SourceId[] = [
  "elevation",
  "pois",
  "transit",
  "hochwasser",
  "natur",
  "geologie",
  "solar",
  "luft",
  "geschosse",
  "sozio",
  "denkmal",
];

// Grobe Bounding-Box für Bayern als schneller Vorfilter. Bewusst konservativ; die präzise
// Abgrenzung macht der Job zusätzlich über das Nominatim-`state`-Feld. Polygon-Verfeinerung später.
const BAYERN_BBOX = { minLat: 47.27, maxLat: 50.57, minLon: 8.97, maxLon: 13.85 };

export function isInBayern(c: Coordinate): boolean {
  return (
    c.lat >= BAYERN_BBOX.minLat &&
    c.lat <= BAYERN_BBOX.maxLat &&
    c.lon >= BAYERN_BBOX.minLon &&
    c.lon <= BAYERN_BBOX.maxLon
  );
}

/**
 * v1: liefert den Bayern-Provider NUR für Koordinaten in Bayern, sonst null. Naht für weitere
 * Provider (NRW/AT/CH).
 */
export function resolveRegionProvider(coord: Coordinate): RegionProvider | null {
  if (!isInBayern(coord)) return null;
  return { id: "bayern", sourceIds: BAYERN_SOURCES };
}
